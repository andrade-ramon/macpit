import type { ProcessInfo, ProjectOverview, Run } from '@macpit/shared';
import { HttpError } from '../../lib/http.js';
import type { ActionStore } from '../actions/store.js';
import type { PortService } from '../ports/service.js';
import type { ProcessService } from '../processes/service.js';
import type { RunManager } from '../runs/manager.js';
import type { RunStore } from '../runs/store.js';
import type { RepoService } from './service.js';

/** Só raízes de execuções ainda vivas, com início compatível (etime tem precisão de segundos). */
export function projectPids(runs: Run[], processes: ProcessInfo[]): Set<number> {
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const owned = new Set<number>();
  for (const r of runs) {
    const p = r.pid === null ? undefined : byPid.get(r.pid);
    if (r.status === 'running' && p && Math.abs(p.startedAt - r.startedAt) <= 3000) owned.add(p.pid);
  }
  // Percurso limitado pelo tamanho do snapshot; ciclos sintéticos não travam a coleta.
  const children = new Map<number, number[]>();
  for (const p of processes) {
    const siblings = children.get(p.ppid) ?? [];
    siblings.push(p.pid);
    children.set(p.ppid, siblings);
  }
  const queue = [...owned];
  for (let i = 0; i < queue.length; i++) {
    for (const pid of children.get(queue[i]!) ?? []) {
      if (!owned.has(pid)) {
        owned.add(pid);
        queue.push(pid);
      }
    }
  }
  return owned;
}

export interface ProjectDeps {
  repos: RepoService;
  actions: ActionStore;
  runs: RunStore;
  manager: RunManager;
  processes: ProcessService;
  ports: PortService;
}

export async function projectOverview(id: string, deps: ProjectDeps): Promise<ProjectOverview> {
  const { repos, actions, runs, manager, processes, ports } = deps;
  const repo = (await repos.listFresh()).repos.find((r) => r.id === id);
  if (!repo) throw new HttpError(404, 'repositório não encontrado', 'not_found');
  const history = runs.forProject(repo.path);
  const available = actions.list().flatMap((action) => {
    const lastRun = runs.lastForProjectAction(repo.path, action.id);
    if (!lastRun && !action.params.some((p) => p.type === 'repo')) return [];
    const current = action.service?.runId ? runs.get(action.service.runId) : undefined;
    const active = action.service && action.service.state !== 'stopped';
    const busyElsewhere = Boolean(active && current?.repoPath !== repo.path);
    return [
      {
        action: {
          ...action,
          lastRun,
          runningCount: history.filter((r) => r.actionId === action.id && r.status === 'running').length,
          service: current?.repoPath === repo.path ? action.service : null,
        },
        busyElsewhere,
      },
    ];
  });
  const overview: ProjectOverview = {
    repo,
    actions: available,
    runs: history,
    ports: [],
    portsLimited: false,
    warnings: [],
  };
  const active = history.filter((r) => manager.isRunning(r.id));
  if (!active.length) return overview;
  try {
    const [snapshot, listeners] = await Promise.all([processes.snapshot(0), ports.list()]);
    // Uma execução pode terminar durante a coleta: nunca reutilizar seu PID depois disso.
    const owned = projectPids(
      active.filter((r) => manager.isRunning(r.id)),
      snapshot.processes,
    );
    overview.ports = listeners.entries.filter((p) => owned.has(p.pid));
    overview.portsLimited = listeners.limited;
  } catch {
    overview.warnings.push('Não foi possível atualizar as portas. As ações e o histórico continuam disponíveis.');
  }
  return overview;
}

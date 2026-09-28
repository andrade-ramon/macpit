import type { Action, ActionInput } from '@macpit/shared';
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLayout } from '../components/layout/LayoutContext';
import { PageTitle, RailEmpty, Workspace } from '../components/layout/Workspace';
import { ActionCard } from '../features/actions/ActionCard';
import { ActionDetail } from '../features/actions/ActionDetail';
import { ActionEditor } from '../features/actions/ActionEditor';
import { CreateActionWithAi } from '../features/ai/CreateActionWithAi';
import { describeRun, runDurationMs } from '../features/actions/actionUtils';
import { ImportShellDialog } from '../features/actions/ImportShellDialog';
import { repoToPick, useRunAction } from '../features/actions/RunLauncher';
import {
  useActions,
  useImportActions,
  useRuns,
  useSaveAction,
  useStartRun,
  useStopRun,
  useStopService,
} from '../features/actions/useActions';
import { useDock } from '../features/terminal/DockContext';
import { RUN_STYLE } from '../features/terminal/runStyle';
import { fmtDur, fmtShort } from '../lib/format';

interface Group {
  key: string;
  title: string;
  items: Action[];
}

/** Favoritas primeiro; depois cada grupo (sem grupo por último). */
function buildGroups(actions: readonly Action[]): Group[] {
  const byName = (a: Action, b: Action) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  const favs = actions.filter((a) => a.favorite).sort(byName);
  const map = new Map<string, Action[]>();
  for (const a of actions) if (!a.favorite) map.set(a.group ?? '', [...(map.get(a.group ?? '') ?? []), a]);
  const keys = [...map.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR')));
  return [
    ...(favs.length ? [{ key: 'fav', title: 'Favoritas', items: favs }] : []),
    ...keys.map((k) => ({ key: k || 'none', title: k || 'Sem grupo', items: map.get(k)!.sort(byName) })),
  ];
}

/** Formato de entrada (para duplicar): sem id, datas e estado. */
function toInput(a: Action): ActionInput {
  return {
    name: a.name,
    command: a.command,
    ...(a.cwd ? { cwd: a.cwd } : {}),
    env: a.env,
    ...(a.group ? { group: a.group } : {}),
    ...(a.icon ? { icon: a.icon } : {}),
    favorite: a.favorite,
    persistent: a.persistent,
    ...(a.expectedPort !== undefined ? { expectedPort: a.expectedPort } : {}),
    autoRestart: a.autoRestart,
    autoStart: false,
    params: a.params,
  };
}

/**
 * Parâmetros de URL: `?sel=<id>` seleciona a ação (detalhes à direita); `?edit=<id>|new` abre o editor;
 * `?repo=<id>` pré-escolhe o repositório no formulário de parâmetros.
 */
export function ActionsPage() {
  const { data: actions, error } = useActions();
  const { data: recent } = useRuns(undefined, 15);
  const dock = useDock();
  const { showRail } = useLayout();
  const start = useStartRun();
  const stop = useStopRun();
  const stopService = useStopService();
  const importer = useImportActions();
  const save = useSaveAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();
  const [group, setGroup] = useState('all');
  const [startingId, setStartingId] = useState<string>();
  const [shellImport, setShellImport] = useState(false);
  const [aiCreate, setAiCreate] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>();

  const selId = params.get('sel') ?? undefined;
  const editId = params.get('edit') ?? undefined;
  const repoPre = params.get('repo') ?? undefined;
  const setParam = (updates: Record<string, string | undefined>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  const select = (id: string | undefined) => {
    setParam({ sel: id, repo: undefined });
    if (id) showRail('right');
  };

  const all = useMemo(() => actions ?? [], [actions]);
  const groups = useMemo(() => buildGroups(all), [all]);
  const groupNames = useMemo(() => [...new Set(all.flatMap((a) => (a.group ? [a.group] : [])))].sort(), [all]);
  const shown = groups.filter((g) => group === 'all' || g.key === group);
  const selected = selId ? all.find((a) => a.id === selId) : undefined;
  const editing = editId && editId !== 'new' ? all.find((a) => a.id === editId) : undefined;
  const existingNames = useMemo(() => new Set(all.map((a) => a.name.toLowerCase())), [all]);

  const launch = useRunAction();
  const run = (a: Action) => {
    // repositório sem padrão → popup de escolha; outros parâmetros → formulário nos detalhes
    if (repoToPick(a)) return launch(a);
    if (a.params.length) return select(a.id);
    setStartingId(a.id);
    start.mutate(
      { actionId: a.id },
      { onSuccess: (r) => dock.openRun(r.id), onSettled: () => setStartingId(undefined) },
    );
  };
  const stopAction = (a: Action) => (a.persistent ? stopService.mutate(a.id) : a.lastRun && stop.mutate(a.lastRun.id));
  const duplicate = (a: Action) =>
    save.mutate(
      { input: { ...toInput(a), name: `${a.name} (cópia)`.slice(0, 80) } },
      { onSuccess: (c) => select(c.id) },
    );

  const importFile = async (file: File) => {
    setNotice(undefined);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return setNotice({ ok: false, text: 'arquivo não é um JSON válido' });
    }
    const list = (parsed as { format?: string; actions?: unknown[] })?.actions;
    // "bash-monitor/actions": exportações de antes da renomeação
    const format = (parsed as { format?: string })?.format;
    if ((format !== 'macpit/actions' && format !== 'bash-monitor/actions') || !Array.isArray(list)) {
      return setNotice({ ok: false, text: 'não parece uma exportação do macpit' });
    }
    importer.mutate(
      { actions: list },
      {
        onSuccess: (r) =>
          setNotice({
            ok: true,
            text:
              `${r.created} ação(ões) importada(s)` +
              (r.skipped.length ? ` · ignoradas: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}` : ''),
          }),
        onError: (e) => setNotice({ ok: false, text: e.message }),
      },
    );
  };

  const navGroups = [
    { key: 'all', title: 'Todas', count: all.length },
    ...groups.map((g) => ({ ...g, count: g.items.length })),
  ];

  const left = (
    <>
      <button onClick={() => setParam({ edit: 'new' })} className="btn btn-xl btn-primary font-bold">
        + Nova ação
      </button>
      <div>
        <div className="eyebrow mb-2">Grupos</div>
        <div className="flex flex-col gap-0.5">
          {navGroups.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              aria-pressed={group === g.key}
              className={`flex h-10 items-center gap-2.5 rounded-[9px] border-0 px-3 text-left font-medium hover:bg-panel2 ${
                group === g.key ? 'bg-panel2 text-text' : 'bg-transparent text-text2'
              }`}
            >
              <span className="flex-1">{g.title}</span>
              <span className="font-mono text-xs text-text3">{g.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Importar / exportar</div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setShellImport(true)}
            className="btn btn-md justify-start"
            title="Criar ações a partir dos seus aliases e funções"
          >
            Importar aliases do shell…
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="btn btn-md justify-start"
            disabled={importer.isPending}
          >
            Importar JSON…
          </button>
          <a
            href="/api/actions/export"
            className="btn btn-md justify-start"
            title="Inclui as variáveis de ambiente das ações — cuidado ao compartilhar"
          >
            Exportar JSON
          </a>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Execuções recentes</div>
        <div className="flex flex-col gap-0.5">
          {(recent ?? []).map((r) => (
            <button
              key={r.id}
              onClick={() => dock.openRun(r.id)}
              className={`grid h-10 grid-cols-[8px_1fr_auto] items-center gap-2.5 rounded-[9px] border-0 px-2.5 text-left hover:bg-panel2 ${
                r.id === dock.active ? 'bg-panel2' : 'bg-transparent'
              }`}
            >
              <span className="dot" style={{ background: RUN_STYLE[r.status].dot }} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{r.actionName}</span>
                <span className="block text-[11px] text-text3">
                  {describeRun(r)} · {fmtShort(r.startedAt)}
                </span>
              </span>
              <span className="font-mono text-[11.5px] text-text3">
                {r.status === 'running' ? 'rodando' : fmtDur(runDurationMs(r) / 1000)}
              </span>
            </button>
          ))}
          {recent?.length === 0 && <span className="px-2.5 text-[13px] text-text3">nenhuma ainda</span>}
        </div>
      </div>
    </>
  );

  const right = selected ? (
    <ActionDetail
      key={`${selected.id}:${repoPre ?? ''}`}
      action={selected}
      repoId={repoPre}
      onClose={() => select(undefined)}
      onEdit={() => setParam({ edit: selected.id })}
      onDuplicate={() => duplicate(selected)}
      onStop={() => stopAction(selected)}
    />
  ) : (
    <RailEmpty>
      Selecione uma ação para ver o comando exato,
      <br />
      preencher parâmetros e executar.
    </RailEmpty>
  );

  return (
    <Workspace
      label="Ações"
      left={left}
      right={right}
      mainClassName="flex flex-col gap-5 overflow-auto px-6 pb-6 pt-[18px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Ações" sub="comandos salvos, executados com um clique num terminal ao vivo" />
        <button className="btn btn-primary" onClick={() => setAiCreate(true)}>
          Criar com IA
        </button>
      </div>
      {notice && (
        <p role="status" className={`m-0 text-sm ${notice.ok ? 'text-accent' : 'text-danger'}`}>
          {notice.text}
        </p>
      )}
      {error && <p className="m-0 text-danger">Falha ao carregar ações: {error.message}</p>}
      {[start.error, stop.error, stopService.error, save.error].map(
        (e, i) =>
          e && (
            <p key={i} className="m-0 text-sm text-danger">
              {e.message}
            </p>
          ),
      )}

      {actions?.length === 0 && (
        <div className="rounded-[14px] border border-dashed border-line2 p-8 text-center text-text2">
          <p className="m-0 text-lg text-text">Nenhuma ação ainda.</p>
          <p className="m-0 mt-1 text-sm">
            Salve aqui aquele comando que você sempre precisa lembrar — por exemplo, o túnel com o banco:
            <code className="ml-1 text-text">ssh -N -L 5432:db.interno:5432 bastion</code>
          </p>
          <button onClick={() => setParam({ edit: 'new' })} className="btn btn-primary mt-4">
            Criar a primeira ação
          </button>
        </div>
      )}

      {shown.map((g) => (
        <section key={g.key} className="flex flex-col gap-2.5">
          <h2 className="card-title m-0">
            {g.title} <span className="font-mono font-normal text-text3">{g.items.length}</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {g.items.map((a) => (
              <ActionCard
                key={a.id}
                action={a}
                selected={a.id === selId}
                busy={startingId === a.id}
                onSelect={() => select(a.id)}
                onRun={() => run(a)}
                onOpenRun={dock.openRun}
                onStop={() => stopAction(a)}
                onEdit={() => setParam({ edit: a.id })}
              />
            ))}
          </div>
        </section>
      ))}

      {shellImport && <ImportShellDialog existingNames={existingNames} onClose={() => setShellImport(false)} />}
      {aiCreate && (
        <CreateActionWithAi
          groups={groupNames}
          onClose={() => setAiCreate(false)}
          onSaved={(a) => {
            setAiCreate(false);
            select(a.id);
          }}
        />
      )}
      {editId && (editId === 'new' || editing) && (
        <ActionEditor
          key={editId}
          action={editing}
          groups={groupNames}
          onClose={() => setParam({ edit: undefined })}
          onSaved={(a) => setParam({ edit: undefined, sel: a.id })}
        />
      )}
    </Workspace>
  );
}

export default ActionsPage;

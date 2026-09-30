import type { Action, Repo } from '@macpit/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useLayout } from '../../components/layout/LayoutContext';
import { Modal } from '../../components/ui/Modal';
import { useRepos } from '../repos/useRepos';
import { useDock } from '../terminal/DockContext';
import { applyRepoVars, initialParamValues, repoProvided } from './actionUtils';
import { filledParams, useStartRun } from './useActions';

/** Parâmetro do tipo repositório sem padrão: o repo é escolhido num popup ao executar. */
export const repoToPick = (a: Action) => a.params.find((p) => p.type === 'repo' && !p.default);

/** Algum parâmetro (além do repositório) ficaria sem valor com as variáveis deste repo? */
export function missingAfterRepo(a: Action, repo: Repo): boolean {
  const provided = repoProvided(a.params, repo);
  return a.params.some((p) => p.type !== 'repo' && p.default === undefined && !provided.has(p.name.toLowerCase()));
}

type Launch = (a: Action, repo?: Repo) => void;
const Ctx = createContext<Launch | null>(null);

/**
 * Único jeito de "executar" uma ação a partir de um botão (card, Visão geral, paleta, terminal):
 * - repositório sem padrão → popup com a lista de repositórios; escolher executa;
 * - outros parâmetros → abre o formulário nos detalhes da ação;
 * - sem parâmetros → executa e abre no terminal.
 */
export function RunLauncherProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { showRail } = useLayout();
  const dock = useDock();
  const start = useStartRun();
  const [picking, setPicking] = useState<Action>();

  const runWithRepo = useCallback(
    (a: Action, repo: Repo) => {
      const param = a.params.find((p) => p.type === 'repo');
      if (!param || !repo.imported) return;
      if (missingAfterRepo(a, repo)) {
        setPicking(undefined);
        showRail('right');
        return navigate(`/actions?sel=${a.id}&repo=${repo.id}`);
      }
      const values = applyRepoVars(a.params, { ...initialParamValues(a.params), [param.name]: repo.id }, repo);
      start.mutate(
        { actionId: a.id, params: filledParams({ ...values, [param.name]: repo.id }) },
        {
          onSuccess: (r) => {
            setPicking(undefined);
            dock.openRun(r.id);
          },
        },
      );
    },
    [navigate, start, dock, showRail],
  );

  const launch = useCallback<Launch>(
    (a, repo) => {
      if (start.isPending) return;
      start.reset();
      if (repo) return runWithRepo(a, repo);
      if (repoToPick(a)) return setPicking(a);
      if (a.params.length) {
        showRail('right');
        return navigate(`/actions?sel=${a.id}`);
      }
      start.mutate({ actionId: a.id }, { onSuccess: (r) => dock.openRun(r.id) });
    },
    [start, navigate, dock, runWithRepo, showRail],
  );

  return (
    <Ctx.Provider value={launch}>
      {children}
      <Modal open={Boolean(start.error && !picking)} onClose={() => start.reset()} label="Não foi possível executar">
        <p className="text-danger">{start.error?.message}</p>
        <button className="btn btn-md" onClick={() => start.reset()}>
          Fechar
        </button>
      </Modal>
      <Modal
        open={Boolean(picking)}
        onClose={() => setPicking(undefined)}
        label="Escolher repositório"
        top
        className="max-w-[640px] overflow-hidden"
      >
        {picking && (
          <RepoPicker
            action={picking}
            busy={start.isPending}
            error={start.error?.message}
            onPick={(r) => runWithRepo(picking, r)}
            onClose={() => setPicking(undefined)}
          />
        )}
      </Modal>
    </Ctx.Provider>
  );
}

export function useRunAction(): Launch {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRunAction fora do RunLauncherProvider');
  return v;
}

function RepoPicker({
  action,
  busy,
  error,
  onPick,
  onClose,
}: {
  action: Action;
  busy: boolean;
  error?: string;
  onPick: (r: Repo) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data, isPending } = useRepos();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const repos = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.repos ?? [])
      .filter((r) => r.imported)
      .filter((r) => !needle || [r.name, r.github ?? '', r.path].some((s) => s.toLowerCase().includes(needle)));
  }, [data, q]);
  const current = Math.min(sel, Math.max(0, repos.length - 1));

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-[18px] py-3.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-panel2 text-lg">
          {action.icon || '▶'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{action.name}</div>
          <div className="text-xs text-text3">Escolha o repositório para executar</div>
        </div>
        <kbd className="rounded-[5px] border border-line2 px-1.5 py-0.5 text-[11px] text-text3">esc</kbd>
      </div>
      <div className="flex h-[52px] items-center gap-3 border-b border-line px-[18px]">
        <span className="text-text3">⌕</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, repos.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const r = repos[current];
              if (r && !busy) onPick(r);
            }
          }}
          placeholder="Buscar repositório (nome, owner/repo ou pasta)…"
          aria-label="Buscar repositório"
          className="flex-1 border-0 bg-transparent text-[15px] outline-none focus:outline-none"
        />
      </div>
      <div role="listbox" aria-label="Repositórios" className="max-h-[420px] overflow-auto p-2">
        {isPending && <p className="m-0 px-3 py-3 text-sm text-text3">Carregando repositórios…</p>}
        {data && repos.length === 0 && (
          <div className="px-3 py-3 text-sm text-text3">
            {q ? 'Nenhum repositório com esse filtro.' : 'Nenhum repositório importado.'}{' '}
            <button
              onClick={() => {
                onClose();
                navigate('/repos');
              }}
              className="link-btn text-sm"
            >
              Configurar em Repositórios →
            </button>
          </div>
        )}
        {repos.map((r, i) => (
          <button
            key={r.id}
            role="option"
            aria-selected={i === current}
            disabled={busy}
            onMouseEnter={() => setSel(i)}
            onClick={() => onPick(r)}
            className={`flex h-12 w-full items-center gap-3 rounded-[10px] border-0 px-3 text-left ${
              i === current ? 'bg-panel2' : 'bg-transparent'
            }`}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-panel2 text-sm">
              ⎇
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.github ?? r.name}</span>
              <span className="block truncate font-mono text-[11.5px] text-text3">{r.path}</span>
            </span>
            {r.branch && <code className="shrink-0 rounded-md bg-panel3 px-2 py-0.5 text-xs">{r.branch}</code>}
            {r.vars.length > 0 && <span className="shrink-0 font-mono text-xs text-text3">{r.vars.length} var.</span>}
            <span className="shrink-0 font-mono text-xs text-accent">{i === current ? '↵ executar' : ''}</span>
          </button>
        ))}
      </div>
      {error && <p className="m-0 border-t border-line px-[18px] py-2.5 text-[13px] text-danger">{error}</p>}
      <div className="flex gap-[18px] border-t border-line px-[18px] py-2.5 text-[11.5px] text-text3">
        <span>↑↓ navegar</span>
        <span>↵ executar no repositório</span>
        <span>esc cancelar</span>
      </div>
    </div>
  );
}

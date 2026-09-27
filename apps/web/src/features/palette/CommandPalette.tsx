import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '../../components/ui/Modal';
import { useRunAction } from '../actions/RunLauncher';
import { useActions, useStartRun } from '../actions/useActions';
import { useRepos } from '../repos/useRepos';
import { useDock } from '../terminal/DockContext';
import { buildItems, groupItems, type PaletteItem } from './paletteItems';

/** Abre/fecha com ⌘K / Ctrl+K em qualquer página. */
export function usePaletteHotkey(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}

/** Paleta ⌘K: executar ações, ir para páginas, buscar processos/portas e abrir repositórios no GitHub. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Paleta de comandos" top className="max-w-[720px] overflow-hidden">
      <PaletteBody onClose={onClose} />
    </Modal>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-line2 px-[5px]">{children}</kbd>;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  /** Ação "armada": o 1º Enter só arma, o 2º executa (evita rodar o comando errado sem querer). */
  const [armed, setArmed] = useState<string>();
  const { data: actions } = useActions();
  const { data: repoList } = useRepos();
  const start = useStartRun();
  const launch = useRunAction();
  const dock = useDock();
  const navigate = useNavigate();
  const groups = useMemo(() => groupItems(buildItems(q, actions ?? [], repoList?.repos ?? [])), [q, actions, repoList]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = Math.min(sel, Math.max(0, flat.length - 1));

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.kind === 'github') {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return onClose();
    }
    if (item.kind !== 'action') {
      navigate(item.to);
      return onClose();
    }
    const a = item.action;
    const liveRun = a.persistent ? a.service?.runId : a.runningCount > 0 ? a.lastRun?.id : undefined;
    if (liveRun && (!a.persistent || a.service?.state !== 'stopped')) dock.openRun(liveRun);
    else if (a.params.length) launch(a);
    else if (armed !== item.id) return setArmed(item.id);
    else {
      navigate(`/actions?sel=${a.id}`);
      start.mutate({ actionId: a.id }, { onSuccess: (r) => dock.openRun(r.id) });
    }
    onClose();
  };

  let index = -1;
  return (
    <div>
      <div className="flex h-[60px] items-center gap-3 border-b border-line px-[18px]">
        <span className="text-base text-text3">⌕</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
            setArmed(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, flat.length - 1));
              setArmed(undefined);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
              setArmed(undefined);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(flat[current]);
            }
          }}
          placeholder="Executar ação, ir para página, buscar processo ou porta…"
          aria-label="Buscar comandos"
          className="flex-1 border-0 bg-transparent text-base outline-none focus:outline-none"
        />
        <kbd className="rounded-[5px] border border-line2 px-1.5 py-0.5 text-[11px] text-text3">esc</kbd>
      </div>
      <div role="listbox" className="max-h-[420px] overflow-auto p-2">
        {flat.length === 0 && <p className="px-3 py-3 text-sm text-text3">Nada encontrado.</p>}
        {groups.map((g) => (
          <div key={g.title}>
            <div className="eyebrow px-3 pb-1 pt-2">{g.title}</div>
            {g.items.map((it) => {
              index++;
              const i = index;
              const isArmed = armed === it.id;
              return (
                <button
                  key={it.id}
                  role="option"
                  aria-selected={i === current}
                  onMouseEnter={() => {
                    if (i !== current) setArmed(undefined);
                    setSel(i);
                  }}
                  onClick={() => choose(it)}
                  className={`flex h-11 w-full items-center gap-3 rounded-[10px] border-0 px-3 text-left ${
                    isArmed ? 'bg-accent-soft' : i === current ? 'bg-panel2' : 'bg-transparent'
                  }`}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-panel2 text-sm">
                    {it.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
                  <span
                    className={`shrink-0 font-mono text-xs ${isArmed ? 'font-semibold text-accent' : it.primary ? 'text-accent' : 'text-text3'}`}
                  >
                    {isArmed ? '↵ de novo para executar' : it.hint}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-[18px] border-t border-line px-[18px] py-2.5 text-[11.5px] text-text3">
        <span>
          <Kbd>↑↓</Kbd> navegar
        </span>
        <span>
          <Kbd>↵</Kbd> escolher · ações pedem ↵ duas vezes
        </span>
        <span>
          <Kbd>g</Kbd> + letra vai para a página
        </span>
      </div>
    </div>
  );
}

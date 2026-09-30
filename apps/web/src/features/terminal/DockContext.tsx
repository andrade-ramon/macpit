import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const KEY = 'macpit-dock';
const MAX_TABS = 8;

interface Persisted {
  runs: string[];
  active: string | null;
  open: boolean;
  height: number;
}

function load(): Persisted {
  const fallback: Persisted = {
    runs: [],
    active: null,
    open: false,
    height: typeof window === 'undefined' ? 280 : Math.min(280, Math.round(window.innerHeight * 0.4)),
  };
  try {
    const v = JSON.parse(
      localStorage.getItem(KEY) ?? localStorage.getItem('bm-dock') ?? 'null',
    ) as Partial<Persisted> | null;
    if (!v) return fallback;
    const runs = Array.isArray(v.runs) ? v.runs.filter((x): x is string => typeof x === 'string').slice(-MAX_TABS) : [];
    return {
      runs,
      active: typeof v.active === 'string' && runs.includes(v.active) ? v.active : (runs.at(-1) ?? null),
      open: v.open !== false,
      height: typeof v.height === 'number' ? v.height : fallback.height,
    };
  } catch {
    return fallback;
  }
}

function save(s: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem localStorage */
  }
}

interface Dock extends Persisted {
  /** Abre (ou foca) a execução numa aba do terminal e expande o dock. */
  openRun: (runId: string) => void;
  closeRun: (runId: string) => void;
  setActive: (runId: string) => void;
  setOpen: (open: boolean) => void;
  setHeight: (h: number) => void;
}

const Ctx = createContext<Dock | null>(null);

/** Terminal fixo embaixo de todas as páginas: abas das execuções abertas (lembradas entre recargas). */
export function DockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const update = useCallback((fn: (s: Persisted) => Persisted) => {
    setState((s) => {
      const next = fn(s);
      save(next);
      return next;
    });
  }, []);

  const openRun = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        runs: s.runs.includes(id) ? s.runs : [...s.runs, id].slice(-MAX_TABS),
        active: id,
        open: true,
      })),
    [update],
  );
  const closeRun = useCallback(
    (id: string) =>
      update((s) => {
        const runs = s.runs.filter((x) => x !== id);
        return { ...s, runs, active: s.active === id ? (runs.at(-1) ?? null) : s.active };
      }),
    [update],
  );
  const setActive = useCallback((id: string) => update((s) => ({ ...s, active: id, open: true })), [update]);
  const setOpen = useCallback((open: boolean) => update((s) => ({ ...s, open })), [update]);
  const setHeight = useCallback((height: number) => update((s) => ({ ...s, height, open: true })), [update]);

  const value = useMemo(
    () => ({ ...state, openRun, closeRun, setActive, setOpen, setHeight }),
    [state, openRun, closeRun, setActive, setOpen, setHeight],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDock(): Dock {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDock fora do DockProvider');
  return v;
}

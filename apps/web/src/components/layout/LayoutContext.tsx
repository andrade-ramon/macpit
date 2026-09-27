import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Rail = 'none' | 'left' | 'right';

interface LayoutState {
  width: number;
  /** ≥ 1500px: as três colunas ficam sempre visíveis. */
  wide: boolean;
  /** ≥ 1100px: rótulos da navegação e busca com texto. */
  mid: boolean;
  /** Em telas menores, qual coluna lateral está aberta (uma por vez). */
  rail: Rail;
  toggleRail: (r: Exclude<Rail, 'none'>) => void;
  /** Garante a coluna visível (ex.: ao selecionar um item, abre os detalhes). */
  showRail: (r: Exclude<Rail, 'none'>) => void;
  showLeft: boolean;
  showRight: boolean;
  /** Modal de atalhos de teclado. */
  help: boolean;
  setHelp: (open: boolean) => void;
}

const Ctx = createContext<LayoutState | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1920 : window.innerWidth));
  const [rail, setRail] = useState<Rail>('none');
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const wide = width >= 1500;
  const toggleRail = useCallback((r: Exclude<Rail, 'none'>) => setRail((cur) => (cur === r ? 'none' : r)), []);
  const showRail = useCallback((r: Exclude<Rail, 'none'>) => setRail(r), []);
  const value = useMemo(
    () => ({
      width,
      wide,
      mid: width >= 1100,
      rail,
      toggleRail,
      showRail,
      showLeft: wide || rail === 'left',
      showRight: wide || rail === 'right',
      help,
      setHelp,
    }),
    [width, wide, rail, toggleRail, showRail, help],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLayout(): LayoutState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLayout fora do LayoutProvider');
  return v;
}

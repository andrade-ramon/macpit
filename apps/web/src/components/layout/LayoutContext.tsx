import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

export type Rail = 'none' | 'left' | 'right';

interface LayoutState {
  width: number;
  /** ≥ 1200px: conteúdo e detalhes cabem lado a lado. */
  wide: boolean;
  /** ≥ 1100px: busca global com texto. */
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
  const { pathname } = useLocation();
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1920 : window.innerWidth));
  const [selection, setSelection] = useState<{ pathname: string; rail: Rail }>({ pathname, rail: 'right' });
  // Filtros de outra página não devem esconder formulários abertos por navegação.
  const rail = selection.pathname === pathname ? selection.rail : 'right';
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const wide = width >= 1200;
  const toggleRail = useCallback(
    (r: Exclude<Rail, 'none'>) =>
      setSelection((cur) => ({ pathname, rail: (cur.pathname === pathname ? cur.rail : 'right') === r ? 'none' : r })),
    [pathname],
  );
  const showRail = useCallback((r: Exclude<Rail, 'none'>) => setSelection({ pathname, rail: r }), [pathname]);
  const value = useMemo(
    () => ({
      width,
      wide,
      mid: width >= 1100,
      rail,
      toggleRail,
      showRail,
      showLeft: rail === 'left',
      showRight: rail === 'right',
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

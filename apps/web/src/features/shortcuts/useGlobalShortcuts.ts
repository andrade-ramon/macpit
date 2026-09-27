import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { cyclePalette } from '../../lib/theme';
import { isTypingTarget, resolveShortcut } from './shortcuts';

const SEARCH = 'input[type="search"]';

/** Busca da página: fica na coluna de filtros (ou no topo do conteúdo, em Repositórios). */
function findSearch(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(SEARCH);
}

/** Atalhos globais de uma tecla (a paleta ⌘K tem o próprio listener). */
export function useGlobalShortcuts(opts: { openHelp: () => void; showFilters: () => void }): void {
  const navigate = useNavigate();
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { openHelp, showFilters } = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(document.activeElement)) return;
      const r = resolveShortcut(pending.current, e.key);
      pending.current = r.pending;
      clearTimeout(timer.current);
      if (r.pending) timer.current = setTimeout(() => (pending.current = null), 1500);
      if (!r.action) return;
      e.preventDefault();
      switch (r.action.kind) {
        case 'navigate':
          navigate(r.action.to);
          break;
        case 'focusSearch': {
          const el = findSearch();
          if (el) el.focus();
          else {
            // coluna de filtros escondida (tela estreita): abre e foca
            showFilters();
            requestAnimationFrame(() => findSearch()?.focus());
          }
          break;
        }
        case 'help':
          openHelp();
          break;
        case 'theme':
          cyclePalette();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer.current);
    };
  }, [navigate, openHelp, showFilters]);
}

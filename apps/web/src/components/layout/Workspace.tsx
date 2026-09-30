import { isValidElement, type ReactNode } from 'react';
import { useLayout } from './LayoutContext';

interface Props {
  /** Coluna esquerda: filtros e contexto. */
  left?: ReactNode;
  /** Coluna direita: detalhes e ações do item selecionado. */
  right?: ReactNode;
  /** Classes do conteúdo central (padding/rolagem mudam por página). */
  mainClassName?: string;
  children: ReactNode;
  label: string;
}

/** Conteúdo com filtros sob demanda e detalhes contextuais ao lado ou abaixo. */
export function Workspace({ left, right, mainClassName = '', children, label }: Props) {
  const { wide, showLeft, showRight } = useLayout();
  const hasLeft = showLeft && left !== undefined;
  const emptyRight = isValidElement(right) && right.type === RailEmpty;
  const hasRight = showRight && right !== undefined && !emptyRight;

  return (
    <div className={`workspace ${hasRight ? 'workspace-with-detail' : ''} ${wide ? 'workspace-wide' : ''}`}>
      <div className="workspace-content">
        {hasLeft && (
          <aside aria-label={`${label} · filtros`} className="workspace-filters">
            {left}
          </aside>
        )}
        <main aria-label={label} className={`min-h-0 min-w-0 bg-bg ${mainClassName}`}>
          {children}
        </main>
      </div>
      {hasRight && (
        <aside aria-label={`${label} · detalhes`} className="workspace-detail">
          {right}
        </aside>
      )}
    </div>
  );
}

/** Cabeçalho de página: título + subtítulo (e, opcionalmente, controles à direita). */
export function PageTitle({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-title">
      <h1 className="m-0 whitespace-nowrap text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
      {sub !== undefined && <span className="text-[13px] text-text2">{sub}</span>}
      {children}
    </div>
  );
}

/** Estado vazio da coluna de detalhes. */
export function RailEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-5 text-center text-[13.5px] leading-[1.6] text-text3">
      <div>{children}</div>
    </div>
  );
}

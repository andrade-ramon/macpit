import type { ReactNode } from 'react';
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

/**
 * Área de trabalho em até 3 colunas separadas por 1px (o fundo da grade é a cor da linha).
 * Em telas ≥ 1500px as laterais ficam sempre visíveis; abaixo disso, uma por vez pelos
 * botões "◧ Filtros" / "Detalhes ◨" do cabeçalho.
 */
export function Workspace({ left, right, mainClassName = '', children, label }: Props) {
  const { wide, showLeft, showRight } = useLayout();
  const hasLeft = showLeft && left !== undefined;
  const hasRight = showRight && right !== undefined;
  const cols = wide
    ? `${left !== undefined ? 'minmax(280px,320px) ' : ''}minmax(0,1fr)${right !== undefined ? ' minmax(380px,460px)' : ''}`
    : hasLeft
      ? 'minmax(260px,300px) minmax(0,1fr)'
      : hasRight
        ? 'minmax(0,1fr) minmax(320px,400px)'
        : 'minmax(0,1fr)';

  return (
    <div className="grid min-h-0 flex-1 gap-px bg-line" style={{ gridTemplateColumns: cols }}>
      {hasLeft && (
        <aside aria-label={`${label} · filtros`} className="flex min-h-0 flex-col gap-5 overflow-auto bg-bg p-5">
          {left}
        </aside>
      )}
      <main aria-label={label} className={`min-h-0 min-w-0 bg-bg ${mainClassName}`}>
        {children}
      </main>
      {hasRight && (
        <aside aria-label={`${label} · detalhes`} className="flex min-h-0 flex-col gap-[18px] overflow-auto bg-bg p-5">
          {right}
        </aside>
      )}
    </div>
  );
}

/** Cabeçalho de página: título + subtítulo (e, opcionalmente, controles à direita). */
export function PageTitle({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <h1 className="m-0 whitespace-nowrap text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
      {sub !== undefined && <span className="whitespace-nowrap text-[13px] text-text3">{sub}</span>}
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

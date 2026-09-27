import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Largura máxima e extras (ex.: `max-w-[520px]`). */
  className?: string;
  /** Alinhado ao topo (paleta ⌘K) em vez de centralizado. */
  top?: boolean;
  children: ReactNode;
}

/** `<dialog>` nativo no estilo do design: fundo escurecido com desfoque, cantos 16px. Esc/clique fora fecham. */
export function Modal({ open, onClose, label, className = '', top, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`modal w-[calc(100%-48px)] ${top ? 'mx-auto mt-[14vh]' : 'm-auto'} ${className}`}
    >
      {open && children}
    </dialog>
  );
}

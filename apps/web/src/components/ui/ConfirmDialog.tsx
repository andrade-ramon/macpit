import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Explicação curta abaixo do título. */
  hint?: ReactNode;
  /** Comando exato, mostrado na caixa preta. */
  command?: string;
  /** Aviso "Este processo pertence ao root." */
  isRoot?: boolean;
  children?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmação de ação destrutiva (design: ícone "!", comando exato, foco em Cancelar). */
export function ConfirmDialog({
  open,
  title,
  hint,
  command,
  isRoot,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} label={title} className="max-w-[520px]">
      <div role="alertdialog" aria-label={title} className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-3.5">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-lg text-danger">
            !
          </span>
          <div>
            <h2 className="m-0 text-lg font-semibold tracking-[-0.01em]">{title}</h2>
            {hint && <p className="m-0 mt-1 text-[13.5px] leading-normal text-text2">{hint}</p>}
          </div>
        </div>
        {command && <pre className="term-box">{command}</pre>}
        {isRoot && <p className="m-0 text-[13px] text-warn">Este processo pertence ao root.</p>}
        {children}
        <div className="flex justify-end gap-2">
          <button autoFocus onClick={onCancel} className="btn btn-lg px-[18px]">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={busy} className="btn btn-lg btn-danger-solid px-[18px]">
            {busy ? 'Enviando…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

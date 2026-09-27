import { Modal } from '../../components/ui/Modal';
import { SHORTCUT_HELP } from './shortcuts';

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Atalhos de teclado" className="max-w-[560px]">
      <div className="flex flex-col gap-3.5 p-6">
        <h2 className="m-0 text-lg font-semibold">Atalhos de teclado</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {SHORTCUT_HELP.map((s) => (
            <div key={s.keys} className="flex min-h-9 items-center gap-3 text-[13px] text-text2">
              <kbd className="kbd min-w-[52px]">{s.keys}</kbd>
              {s.description}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="btn btn-md">
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

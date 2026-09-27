import type { ActionInput, ShellEntry } from '@macpit/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useImportActions, useShellEntries } from './useActions';

const key = (e: ShellEntry) => `${e.kind}:${e.name}`;

/** Lista aliases e funções do shell do usuário e cria ações com as escolhidas. */
export function ImportShellDialog({ existingNames, onClose }: { existingNames: Set<string>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data, error, isFetching } = useShellEntries(true);
  const importer = useImportActions();
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState('Importadas');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const entries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data?.entries ?? []).filter(
      (e) => !q || e.name.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const toggle = (e: ShellEntry) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key(e))) next.delete(key(e));
      else next.add(key(e));
      return next;
    });

  const submit = () => {
    const actions: ActionInput[] = (data?.entries ?? [])
      .filter((e) => picked.has(key(e)))
      .map((e) => ({
        name: e.name,
        command: e.command,
        group: group.trim() || undefined,
        icon: e.kind === 'function' ? 'ƒ' : undefined,
      }));
    importer.mutate({ actions }, { onSuccess: () => setPicked(new Set()) });
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto flex max-h-[85vh] w-full max-w-3xl flex-col modal"
    >
      <div className="space-y-3 border-b border-line p-5">
        <h2 className="text-lg font-semibold">Importar do shell</h2>
        <p className="text-sm text-text2">
          Lidos de <code>{data?.shell ?? '$SHELL'}</code> interativo (seu <code>.zshrc</code>/<code>.bashrc</code>).
          <br />
          <strong>Aliases</strong> viram ações com o comando expandido. <strong>Funções</strong> (só zsh, das suas
          dotfiles) rodam como <code>{`zsh -ic 'função "$@"' _`}</code> — dá para acrescentar argumentos ao final, ex.{' '}
          <code>{'{{porta}}'}</code>.
        </p>
        {data?.warning && <p className="text-xs text-warn">{data.warning}</p>}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar…"
          className="input w-full"
          aria-label="Filtrar"
          autoFocus
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-2">
        {isFetching && <p className="py-4 text-sm text-text3">Lendo o shell…</p>}
        {error && <p className="py-4 text-sm text-danger">{error.message}</p>}
        {data && entries.length === 0 && <p className="py-4 text-sm text-text3">Nada encontrado.</p>}
        <ul>
          {entries.map((e) => {
            const exists = existingNames.has(e.name.toLowerCase());
            return (
              <li key={key(e)}>
                <label
                  className={`flex items-start gap-3 rounded px-2 py-1.5 text-sm hover:bg-panel2 ${exists ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(key(e))}
                    onChange={() => toggle(e)}
                    disabled={exists}
                    className="mt-1"
                  />
                  <span className="w-16 shrink-0 text-xs uppercase text-text3">
                    {e.kind === 'alias' ? 'alias' : 'função'}
                  </span>
                  <span className="w-40 shrink-0 truncate font-mono">{e.name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text3" title={e.detail}>
                    {e.detail}
                  </span>
                  {exists && <span className="shrink-0 text-xs text-text3">já existe</span>}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
        <label className="flex items-center gap-2 text-sm text-text2">
          Grupo
          <input value={group} onChange={(e) => setGroup(e.target.value)} maxLength={40} className="input w-40" />
        </label>
        {importer.data && (
          <span className="text-sm text-accent">
            {importer.data.created} importada(s)
            {importer.data.skipped.length ? ` · ${importer.data.skipped.length} ignorada(s)` : ''}
          </span>
        )}
        {importer.error && <span className="text-sm text-danger">{importer.error.message}</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="btn">
            {importer.data ? 'Fechar' : 'Cancelar'}
          </button>
          <button onClick={submit} disabled={picked.size === 0 || importer.isPending} className="btn btn-primary">
            Importar {picked.size || ''}
          </button>
        </div>
      </div>
    </dialog>
  );
}

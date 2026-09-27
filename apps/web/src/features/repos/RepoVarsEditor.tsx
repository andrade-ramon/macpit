import type { Repo } from '@macpit/shared';
import { PARAM_NAME_RE } from '@macpit/shared';
import { useState } from 'react';
import { useSaveRepoVars } from './useRepos';

interface Row {
  name: string;
  value: string;
  secret: boolean;
  /** Segredo já salvo: vazio = manter. */
  saved: boolean;
}

const toRows = (repo: Repo): Row[] =>
  repo.vars.map((v) => ({ name: v.name, value: v.value, secret: v.secret, saved: v.secret && v.hasValue }));

/** Variáveis do repositório: preenchem os `{{parâmetros}}` de mesmo nome das ações. */
export function RepoVarsEditor({ repo }: { repo: Repo }) {
  const save = useSaveRepoVars();
  const [rows, setRows] = useState<Row[]>(() => toRows(repo));
  const [savedAt, setSavedAt] = useState<number>();
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const names = rows.map((r) => r.name.toLowerCase());
  const bad = rows.filter((r) => !PARAM_NAME_RE.test(r.name));
  const dup = new Set(names).size !== names.length;
  const unsavedSecret = rows.filter((r) => r.secret && !r.saved && !r.value);
  const dirty = JSON.stringify(rows) !== JSON.stringify(toRows(repo));

  const submit = () =>
    save.mutate(
      {
        id: repo.id,
        input: {
          vars: rows.map((r) => ({
            name: r.name,
            secret: r.secret,
            ...(r.secret && r.saved && !r.value ? {} : { value: r.value }),
          })),
        },
      },
      {
        onSuccess: (updated) => {
          setRows(toRows(updated));
          setSavedAt(Date.now());
        },
      },
    );

  return (
    <form
      className="tile flex flex-col gap-2.5 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Variáveis do repo</span>
        <span className="text-right text-xs text-text3">preenchem parâmetros com o mesmo nome</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px_28px] items-center gap-1.5 [&>*]:min-w-0"
        >
          <input
            value={r.name}
            onChange={(e) => set(i, { name: e.target.value })}
            placeholder="NOME"
            aria-label="Nome da variável do repositório"
            className={`input h-10 px-2.5 font-mono text-[13px] ${PARAM_NAME_RE.test(r.name) ? '' : 'border-danger'}`}
          />
          <input
            value={r.value}
            onChange={(e) => set(i, { value: e.target.value })}
            type={r.secret ? 'password' : 'text'}
            autoComplete="off"
            placeholder={r.saved ? '•••••••• (salvo no servidor)' : 'valor'}
            aria-label="Valor da variável do repositório"
            className="input h-10 px-2.5 font-mono text-[13px]"
          />
          <button
            type="button"
            onClick={() => set(i, { secret: !r.secret, saved: false, value: r.secret ? r.value : '' })}
            aria-pressed={r.secret}
            aria-label={r.secret ? `Segredo: ${r.name}` : `Marcar ${r.name || 'variável'} como segredo`}
            title={r.secret ? 'Segredo — nunca vem para o navegador' : 'Marcar como segredo'}
            className="h-10 rounded-[9px] border border-line2 bg-panel2"
            style={{ color: r.secret ? 'var(--warn)' : 'var(--text3)' }}
          >
            {r.secret ? '🔒' : '○'}
          </button>
          <button
            type="button"
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            aria-label="Remover variável do repositório"
            className="h-10 rounded-lg border-0 bg-transparent text-text3 hover:bg-panel2 hover:text-text"
          >
            ✕
          </button>
        </div>
      ))}
      {rows.length === 0 && <p className="m-0 text-[13px] text-text3">Nenhuma variável ainda.</p>}
      {dup && <p className="m-0 text-xs text-danger">Nomes repetidos.</p>}
      {unsavedSecret.length > 0 && (
        <p className="m-0 text-xs text-danger">
          Informe o valor de {unsavedSecret.map((r) => r.name || '(sem nome)').join(', ')}.
        </p>
      )}
      {save.error && <p className="m-0 text-xs text-danger">{save.error.message}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { name: '', value: '', secret: false, saved: false }])}
          className="btn btn-md"
        >
          + Variável
        </button>
        {savedAt && !dirty && <span className="text-xs text-accent">salvo</span>}
        <button
          type="submit"
          disabled={!dirty || bad.length > 0 || dup || unsavedSecret.length > 0 || save.isPending}
          className="btn btn-md btn-primary ml-auto px-4 font-bold"
        >
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      <p className="m-0 text-xs text-text3">
        Segredos (🔒) nunca saem do servidor; o valor é preenchido na hora de executar. Tudo fica no banco local do
        macpit, nunca no repositório.
      </p>
    </form>
  );
}

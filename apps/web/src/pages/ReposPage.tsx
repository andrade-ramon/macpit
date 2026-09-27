import type { Action, Repo, RepoSettings } from '@macpit/shared';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLayout } from '../components/layout/LayoutContext';
import { PageTitle, RailEmpty, Workspace } from '../components/layout/Workspace';
import { applyRepoVars, initialParamValues, repoProvided } from '../features/actions/actionUtils';
import { filledParams, useActions, useStartRun } from '../features/actions/useActions';
import { RepoVarsEditor } from '../features/repos/RepoVarsEditor';
import {
  useRepos,
  useRepoSettings,
  useSaveRepoSelection,
  useSaveRepoSettings,
  useScanRepos,
} from '../features/repos/useRepos';
import { useDock } from '../features/terminal/DockContext';
import { api } from '../lib/api';

const COLS = '28px minmax(160px,1fr) minmax(180px,1fr) 160px minmax(240px,1.4fr) 140px';

function RootsCard() {
  const { data } = useRepoSettings();
  // remonta o editor quando o salvo muda (rascunho parte do valor do servidor)
  return data ? <RootsEditor key={JSON.stringify(data)} data={data} /> : null;
}

function RootsEditor({ data }: { data: RepoSettings }) {
  const save = useSaveRepoSettings();
  const [draft, setDraft] = useState<RepoSettings>(data);
  const [newRoot, setNewRoot] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const add = () => {
    const r = newRoot.trim();
    if (r && !draft.roots.includes(r)) setDraft({ ...draft, roots: [...draft.roots, r] });
    setNewRoot('');
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="eyebrow">Pastas de projetos</div>
      {draft.roots.length === 0 && (
        <p className="m-0 text-[13px] text-text2">
          Informe a pasta onde ficam seus projetos (ex.: <code>~/github</code>). Os repositórios git dentro dela são
          encontrados automaticamente.
        </p>
      )}
      {draft.roots.map((r) => (
        <div key={r} className="tile flex h-11 items-center gap-2 rounded-[10px] pl-3.5 pr-1.5">
          <code className="flex-1 truncate text-[13.5px]">{r}</code>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, roots: draft.roots.filter((x) => x !== r) })}
            aria-label={`Remover pasta ${r}`}
            className="h-8 w-8 rounded-lg border-0 bg-transparent text-text3 hover:bg-panel2"
          >
            ✕
          </button>
        </div>
      ))}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={newRoot}
          onChange={(e) => setNewRoot(e.target.value)}
          placeholder={draft.roots.length ? '~/outra-pasta' : '~/github'}
          aria-label="Nova pasta de projetos"
          className="h-[42px] min-w-0 flex-1 rounded-[10px] border border-line2 bg-panel px-3 font-mono text-[13.5px]"
        />
        <button type="submit" disabled={!newRoot.trim()} className="btn h-[42px] rounded-[10px] px-3.5">
          + Pasta
        </button>
      </form>
      <label className="flex items-center justify-between gap-2 text-[13px] text-text2">
        Profundidade
        <select
          value={draft.maxDepth}
          onChange={(e) => setDraft({ ...draft, maxDepth: Number(e.target.value) })}
          className="h-10 rounded-[9px] border border-line2 bg-panel px-2.5"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'nível' : 'níveis'}
            </option>
          ))}
        </select>
      </label>
      <p className="m-0 text-xs text-text3">~/github/org/projeto = 2 níveis</p>
      {save.error && <p className="m-0 text-xs text-danger">{save.error.message}</p>}
      <button
        type="button"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate(draft)}
        className="btn btn-lg btn-primary font-bold"
      >
        {save.isPending ? 'Salvando e procurando…' : 'Salvar e procurar'}
      </button>
    </div>
  );
}

export function ReposPage() {
  const navigate = useNavigate();
  const dock = useDock();
  const { showRail } = useLayout();
  const { data, error, isPending } = useRepos();
  const { data: actions } = useActions();
  const scan = useScanRepos();
  const select = useSaveRepoSelection();
  const start = useStartRun();
  const [q, setQ] = useState('');
  const [onlyGithub, setOnlyGithub] = useState(true);
  const [show, setShow] = useState<'all' | 'imported' | 'not'>('all');
  const [selectedId, setSelectedId] = useState<string>();

  const all = useMemo(() => data?.repos ?? [], [data]);
  const repos = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!onlyGithub || r.github) &&
        (show === 'all' || (show === 'imported') === r.imported) &&
        (!needle || [r.name, r.github ?? '', r.path].some((s) => s.toLowerCase().includes(needle))),
    );
  }, [all, q, onlyGithub, show]);
  const importedPaths = all.filter((r) => r.imported).map((r) => r.path);
  const githubCount = all.filter((r) => r.github).length;
  const sel = all.find((r) => r.id === selectedId);

  const setImported = (paths: string[], on: boolean) => {
    const set = new Set(importedPaths);
    for (const p of paths) {
      if (on) set.add(p);
      else set.delete(p);
    }
    select.mutate([...set]);
  };
  const pick = (r: Repo) => {
    setSelectedId(r.id);
    showRail('right');
  };

  const listed = repos.length === all.length ? 'todos' : `os ${repos.length} listados`;
  const left = (
    <>
      <RootsCard />
      <div className="tile flex flex-col gap-2 p-3.5">
        <span className="eyebrow">Importados</span>
        <p className="m-0 text-[12.5px] leading-[1.55] text-text2">
          Só os repositórios <strong className="text-text">importados</strong> aparecem para escolha nas ações e na
          paleta ⌘K ({importedPaths.length} de {all.length}).{' '}
          {data?.hasSelection
            ? 'Repositórios novos entram desmarcados.'
            : 'Enquanto você não escolher, todos contam como importados.'}
        </p>
        <select
          value={show}
          onChange={(e) => setShow(e.target.value as typeof show)}
          aria-label="Mostrar"
          className="h-10 rounded-[9px] border border-line2 bg-bg px-2.5 text-[13px]"
        >
          <option value="all">mostrar todos</option>
          <option value="imported">só importados ({importedPaths.length})</option>
          <option value="not">só não importados ({all.length - importedPaths.length})</option>
        </select>
        {repos.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() =>
                setImported(
                  repos.map((r) => r.path),
                  true,
                )
              }
              className="btn btn-md"
            >
              Importar {listed}
            </button>
            <button
              onClick={() =>
                setImported(
                  repos.map((r) => r.path),
                  false,
                )
              }
              className="btn btn-md"
            >
              Não importar {listed === 'todos' ? 'nenhum' : listed}
            </button>
          </div>
        )}
        {select.error && <p className="m-0 text-xs text-danger">{select.error.message}</p>}
      </div>
      <div className="tile px-3.5 py-3 text-[12.5px] leading-[1.55] text-text2">
        Em uma ação, crie um parâmetro do tipo <strong className="text-text">repositório</strong>: ao executar você
        escolhe o repo, a ação roda na pasta dele e os demais parâmetros recebem as variáveis salvas aqui.{' '}
        <button onClick={() => navigate('/actions')} className="link-btn text-[12.5px] font-medium">
          Ir para Ações →
        </button>
      </div>
    </>
  );

  const right = sel ? (
    <RepoDetail
      key={sel.id}
      repo={sel}
      actions={(actions ?? []).filter((a) => a.params.some((p) => p.type === 'repo'))}
      onClose={() => setSelectedId(undefined)}
      onRunHere={(a) => {
        const repoParam = a.params.find((p) => p.type === 'repo')!;
        const values = applyRepoVars(a.params, { ...initialParamValues(a.params), [repoParam.name]: sel.id }, sel);
        const provided = repoProvided(a.params, sel);
        const missing = a.params.some(
          (p) => p.type !== 'repo' && !values[p.name] && p.default === undefined && !provided.has(p.name.toLowerCase()),
        );
        if (missing) return navigate(`/actions?sel=${a.id}&repo=${sel.id}`);
        start.mutate(
          { actionId: a.id, params: filledParams({ ...values, [repoParam.name]: sel.id }) },
          { onSuccess: (r) => dock.openRun(r.id) },
        );
      }}
      runError={start.error?.message}
    />
  ) : (
    <RailEmpty>
      Selecione um repositório para editar
      <br />
      as variáveis e abrir no GitHub.
    </RailEmpty>
  );

  return (
    <Workspace label="Repositórios" left={left} right={right} mainClassName="flex flex-col overflow-hidden">
      <div className="px-6 pb-3 pt-[18px]">
        <PageTitle title="Repositórios" sub={data ? `${all.length} encontrados · ${githubCount} no GitHub` : undefined}>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <label className="relative min-w-0 shrink">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text3">⌕</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, owner/repo ou pasta"
                aria-label="Buscar repositórios"
                className="h-[38px] w-[300px] min-w-[140px] max-w-full rounded-[10px] border border-line2 bg-panel pl-[34px] pr-3"
              />
            </label>
            <button
              onClick={() => setOnlyGithub(!onlyGithub)}
              aria-pressed={onlyGithub}
              className="h-[38px] shrink-0 whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-medium"
              style={{
                borderColor: onlyGithub ? 'var(--accent)' : 'var(--line2)',
                background: onlyGithub ? 'var(--accent-soft)' : 'var(--panel2)',
              }}
            >
              Só GitHub
            </button>
            <button
              onClick={() => scan.mutate()}
              disabled={scan.isPending}
              className="btn h-[38px] shrink-0 rounded-[10px]"
            >
              {scan.isPending ? 'Procurando…' : '↻ Procurar de novo'}
            </button>
          </div>
        </PageTitle>
      </div>
      {error && <p className="mx-6 text-danger">{error.message}</p>}
      {data?.errors.map((e) => (
        <p key={e} className="mx-6 my-1 text-sm text-warn">
          {e}
        </p>
      ))}
      {isPending && <p className="mx-6 text-text3">Procurando repositórios…</p>}
      {data && (
        <div className="mx-6 mb-5 min-h-0 flex-1 overflow-auto rounded-[14px] border border-line bg-panel">
          <div className="min-w-[1000px]">
            <div className="table-head grid items-center gap-3" style={{ gridTemplateColumns: COLS }}>
              <span title="Importado: aparece nas ações e na paleta">✓</span>
              <span>Repositório</span>
              <span>GitHub</span>
              <span>Branch</span>
              <span>Pasta</span>
              <span className="text-right">Variáveis</span>
            </div>
            {repos.length === 0 && (
              <p className="px-4 py-6 text-center text-[13px] text-text3">
                {all.length === 0 ? 'Nenhum repositório encontrado nas pastas configuradas.' : 'Nada com esse filtro.'}
              </p>
            )}
            {repos.map((r) => (
              <div
                key={r.id}
                onClick={() => pick(r)}
                className={`data-row grid h-[52px] items-center gap-3 ${r.imported ? '' : 'opacity-55'}`}
                style={{
                  gridTemplateColumns: COLS,
                  background: r.id === selectedId ? 'var(--accent-soft)' : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={r.imported}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setImported([r.path], e.target.checked)}
                  aria-label={`Importar ${r.github ?? r.name}`}
                  title="Importar: aparece nas ações e na paleta"
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="truncate font-semibold">{r.name}</span>
                <span className="truncate text-[13px]" style={{ color: r.github ? 'var(--info)' : 'var(--text3)' }}>
                  {r.github ?? (r.remote ? 'outro remote' : 'sem remote')}
                </span>
                <span>{r.branch && <code className="rounded-md bg-panel2 px-2 py-0.5 text-xs">{r.branch}</code>}</span>
                <span className="truncate font-mono text-xs text-text3" title={r.path}>
                  {r.path}
                </span>
                <span className="text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      pick(r);
                    }}
                    className="btn h-[34px]"
                  >
                    {r.vars.length ? `${r.vars.length} variáve${r.vars.length === 1 ? 'l' : 'is'}` : '+ Variáveis'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Workspace>
  );
}

function RepoDetail({
  repo,
  actions,
  onClose,
  onRunHere,
  runError,
}: {
  repo: Repo;
  actions: Action[];
  onClose: () => void;
  onRunHere: (a: Action) => void;
  runError?: string;
}) {
  const open = useMutation({ mutationFn: () => api<{ ok: true }>(`/api/repos/${repo.id}/open`, { method: 'POST' }) });
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Repositório</div>
          <h2 className="m-0 mt-0.5 truncate text-xl font-semibold tracking-[-0.01em]">{repo.name}</h2>
          <div className="text-[13px] text-text2">
            {repo.github ?? 'sem GitHub'}
            {repo.branch && (
              <>
                {' '}
                · <code>{repo.branch}</code>
              </>
            )}
          </div>
        </div>
        <button onClick={onClose} aria-label="Fechar detalhes" className="btn btn-icon">
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {repo.github ? (
          <a
            href={`https://github.com/${repo.github}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-md h-[42px] w-full"
          >
            Abrir no GitHub ↗
          </a>
        ) : (
          <button disabled className="btn btn-md h-[42px]">
            Sem GitHub
          </button>
        )}
        <button onClick={() => open.mutate()} disabled={open.isPending} className="btn btn-md h-[42px]">
          Abrir pasta
        </button>
      </div>
      {open.error && <p className="m-0 text-xs text-danger">{open.error.message}</p>}
      {!repo.imported && (
        <p className="m-0 text-[12.5px] text-warn">
          Não importado: não aparece para escolha nas ações. Marque a caixa na lista para importar.
        </p>
      )}
      <RepoVarsEditor repo={repo} />
      <div>
        <div className="eyebrow mb-1.5">Ações que usam este repo</div>
        <div className="flex flex-col gap-1.5">
          {actions.map((a) => (
            <div key={a.id} className="tile flex items-center gap-2.5 rounded-[10px] px-3 py-2.5">
              <span>{a.icon || '▶'}</span>
              <span className="flex-1 truncate font-medium">{a.name}</span>
              <button
                onClick={() => onRunHere(a)}
                disabled={!repo.imported}
                className="btn btn-primary h-[34px] rounded-[9px]"
              >
                ▶ Executar aqui
              </button>
            </div>
          ))}
          {actions.length === 0 && (
            <p className="m-0 text-[13px] text-text3">Nenhuma ação com parâmetro do tipo repositório ainda.</p>
          )}
          {runError && <p className="m-0 text-xs text-danger">{runError}</p>}
        </div>
      </div>
    </>
  );
}

export default ReposPage;

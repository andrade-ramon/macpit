import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Panel } from '@macpit/shared';
import { PageTitle, RailEmpty, Workspace } from '../components/layout/Workspace';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ProjectPanel } from '../features/repos/ProjectPanel';
import { usePanels, useRemovePanel } from '../features/repos/usePanels';
import { useScanRepos } from '../features/repos/useRepos';
import { fmtShort } from '../lib/format';

export default function PanelsPage() {
  const [search, setSearch] = useSearchParams();
  const id = search.get('project');
  const [q, setQ] = useState('');
  const [removing, setRemoving] = useState<Panel>();
  const { data, isPending, error, refetch, isFetching } = usePanels();
  const remove = useRemovePanel();
  const scan = useScanRepos();
  const selected = data?.find((p) => p.id === id);
  const needle = q.trim().toLocaleLowerCase('pt-BR');
  const filtered = (data ?? []).filter((p) => `${p.name} ${p.repoPath}`.toLocaleLowerCase('pt-BR').includes(needle));
  const pick = (panel: Panel) => setSearch({ project: panel.id });
  const askRemove = (panel: Panel) => {
    remove.reset();
    setRemoving(panel);
  };

  const left = (
    <>
      <div className="eyebrow">Painéis salvos</div>
      <p className="m-0 text-sm text-text2">
        Abra um projeto em Repositórios e clique em Salvar painel para adicioná-lo aqui.
      </p>
      <Link to="/repos" className="btn btn-md">
        Escolher um projeto
      </Link>
      <nav aria-label="Painéis salvos" className="flex flex-col gap-2">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p)}
            aria-current={p.id === id ? 'page' : undefined}
            className={`tile w-full p-3 text-left ${p.id === id ? 'border-accent bg-accent-soft' : ''}`}
          >
            <span className="block truncate font-semibold">{p.name}</span>
            <span className={`block text-xs ${p.available ? 'text-text3' : 'text-warn'}`}>
              {p.available ? 'Projeto disponível' : 'Repositório indisponível'}
            </span>
          </button>
        ))}
      </nav>
    </>
  );
  const right = selected ? (
    <>
      <div className="eyebrow">Painel salvo</div>
      <h2 className="m-0 break-words text-xl font-semibold">{selected.name}</h2>
      <p className="m-0 break-all font-mono text-xs text-text3">{selected.repoPath}</p>
      <p className="m-0 text-sm text-text2">Salvo em {fmtShort(selected.savedAt)}</p>
      <p className="m-0 text-sm text-text2">
        Este acesso abre os dados atuais do projeto. Salvar ou abrir o painel não inicia ações.
      </p>
      {selected.available && (
        <Link className="btn btn-md" to={`/repos?project=${selected.id}`}>
          Ver em Repositórios
        </Link>
      )}
      <button className="btn btn-md btn-danger-outline" onClick={() => askRemove(selected)}>
        Remover painel salvo
      </button>
    </>
  ) : (
    <RailEmpty>Escolha um painel salvo para abrir o projeto.</RailEmpty>
  );

  return (
    <>
      <Workspace label="Painéis" left={left} right={right} mainClassName="flex flex-col overflow-hidden">
        <div className="px-6 pb-4 pt-[18px]">
          <PageTitle title="Painéis" />
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="search"
              aria-label="Buscar painéis"
              placeholder="Buscar por nome ou pasta"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="input min-w-0 flex-1"
            />
            <button className="btn btn-md" disabled={isFetching} onClick={() => void refetch()}>
              Atualizar lista
            </button>
          </div>
        </div>
        {isPending && <p className="mx-6 text-text3">Carregando painéis…</p>}
        {error && (
          <p role="alert" className="mx-6 text-danger">
            Não foi possível carregar os painéis: {error.message}
          </p>
        )}
        {data && id && !selected && (
          <div className="mx-6 text-sm text-text2">
            <p>Este painel não está salvo ou foi removido.</p>
            <Link to="/panels" className="btn btn-md">
              Voltar à lista
            </Link>
          </div>
        )}
        {selected?.available && <ProjectPanel key={selected.id} id={selected.id} fromPanels />}
        {selected && !selected.available && (
          <div className="mx-6 card p-5">
            <h2 className="m-0 text-lg font-semibold">Repositório indisponível</h2>
            <p className="text-sm text-text2">
              O painel continua salvo, mas a pasta não foi encontrada na última varredura. Confira as pastas
              configuradas em Repositórios.
            </p>
            <button
              className="btn btn-md"
              disabled={scan.isPending}
              onClick={() => scan.mutate(undefined, { onSuccess: () => void refetch() })}
            >
              {scan.isPending ? 'Procurando…' : 'Procurar repositórios novamente'}
            </button>
            {scan.error && (
              <p role="alert" className="text-danger">
                {scan.error.message}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/repos" className="btn btn-md">
                Configurar repositórios
              </Link>
              <button className="btn btn-md btn-danger-outline" onClick={() => askRemove(selected)}>
                Remover painel salvo
              </button>
              <Link to="/panels" className="btn btn-md">
                Voltar à lista
              </Link>
            </div>
          </div>
        )}
        {data && !id && (
          <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
            {!data.length && (
              <section className="card p-6">
                <h2 className="m-0 text-lg font-semibold">Nenhum painel salvo</h2>
                <p className="text-sm text-text2">
                  Salve o painel de um projeto para acessá-lo rapidamente por esta aba.
                </p>
                <Link to="/repos" className="btn btn-md btn-primary">
                  Ir para Repositórios
                </Link>
              </section>
            )}
            {data.length > 0 && !filtered.length && <p className="text-text3">Nenhum painel com esse filtro.</p>}
            <div className="grid grid-cols-1 gap-3">
              {filtered.map((p) => (
                <article key={p.id} aria-label={`Painel ${p.name}`} className="card min-w-0 p-4">
                  <h2 className="m-0 break-words text-lg font-semibold">{p.name}</h2>
                  <p className="break-all font-mono text-xs text-text3">{p.repoPath}</p>
                  {!p.available && <p className="text-sm text-warn">Repositório indisponível · painel preservado</p>}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-md btn-primary" onClick={() => pick(p)}>
                      {p.available ? 'Abrir painel' : 'Ver detalhes'}
                    </button>
                    <button className="btn btn-md btn-ghost" onClick={() => askRemove(p)}>
                      Remover
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </Workspace>
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remover painel salvo?"
        hint={`Remover “${removing?.name ?? ''}” da lista? O projeto, suas ações e execuções serão mantidos.`}
        confirmLabel="Remover painel"
        busy={remove.isPending}
        onCancel={() => {
          if (!remove.isPending) setRemoving(undefined);
        }}
        onConfirm={() => {
          if (removing)
            remove.mutate(removing.id, {
              onSuccess: () => {
                setRemoving(undefined);
                if (id === removing.id) setSearch({});
              },
            });
        }}
      >
        {remove.error && (
          <p role="alert" className="text-danger">
            {remove.error.message}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

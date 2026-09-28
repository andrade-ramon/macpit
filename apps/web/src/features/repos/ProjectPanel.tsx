import { Link } from 'react-router';
import { useRunAction } from '../actions/RunLauncher';
import { useStopService } from '../actions/useActions';
import { useDock } from '../terminal/DockContext';
import { runStyle, serviceStyle } from '../terminal/runStyle';
import { fmtShort } from '../../lib/format';
import { useProject } from './useRepos';
import { usePanels, useSavePanel } from './usePanels';

export function ProjectPanel({ id, fromPanels = false }: { id: string; fromPanels?: boolean }) {
  const { data, error, isPending, isFetching, refetch } = useProject(id);
  const panels = usePanels();
  const save = useSavePanel();
  const saved = panels.data?.some((p) => p.id === id);
  const launch = useRunAction();
  const dock = useDock();
  const stop = useStopService();
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-6" aria-label="Painel do projeto">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to={fromPanels ? '/panels' : '/repos'} className="btn btn-md">
          {fromPanels ? '← Painéis salvos' : '← Todos os repositórios'}
        </Link>
        <button className="btn btn-md" disabled={isFetching} onClick={() => void refetch()}>
          Atualizar painel
        </button>
        <button
          className="btn btn-md btn-primary"
          disabled={!data || Boolean(error) || saved || save.isPending || panels.isPending}
          onClick={() => save.mutate(id)}
        >
          {saved ? '✓ Painel salvo' : save.isPending ? 'Salvando…' : 'Salvar painel'}
        </button>
        {!fromPanels && (
          <Link to="/panels" className="btn btn-md">
            Ver painéis salvos
          </Link>
        )}
      </div>
      {save.error && (
        <p role="alert" className="text-danger">
          Não foi possível salvar: {save.error.message}
        </p>
      )}
      {isPending && <p className="text-text3">Carregando projeto…</p>}
      {error && (
        <p role="alert" className="text-danger">
          Não foi possível atualizar o projeto: {error.message}
        </p>
      )}
      {data && (
        <>
          <h2 className="m-0 text-xl font-semibold">{data.repo.github ?? data.repo.name}</h2>
          <p className="break-all font-mono text-xs text-text3">{data.repo.path}</p>
          <p className="text-sm text-text2">
            {data.runs.filter((r) => r.status === 'running').length} execuções ativas · {data.ports.length} portas
            vinculadas
          </p>
          {!data.repo.imported && (
            <p className="text-warn">Projeto não importado. Importe-o na lista para executar ações.</p>
          )}
          {data.warnings.map((w) => (
            <p key={w} role="status" className="text-warn">
              {w}
            </p>
          ))}
          {stop.error && (
            <p role="alert" className="text-danger">
              {stop.error.message}
            </p>
          )}
          {(['Ações disponíveis', 'Serviços'] as const).map((title) => {
            const entries = data.actions.filter(({ action }) => action.persistent === (title === 'Serviços'));
            return (
              <section key={title} aria-label={title} className="card mt-4 p-4">
                <h3 className="card-title m-0 mb-3">{title}</h3>
                {entries.length === 0 && (
                  <p className="text-sm text-text3">
                    Nenhum item disponível. Crie uma ação com parâmetro do tipo repositório.
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {entries.map(({ action: a, busyElsewhere }) => {
                    const badge = a.service ? serviceStyle(a.service) : a.lastRun ? runStyle(a.lastRun) : null;
                    const active = a.service && a.service.state !== 'stopped';
                    const canRun = a.params.some((p) => p.type === 'repo');
                    return (
                      <article key={a.id} aria-label={a.name} className="tile flex flex-wrap items-center gap-2 p-3">
                        <div className="min-w-0 flex-1 basis-40">
                          <Link to={`/actions?sel=${a.id}&repo=${data.repo.id}`} className="font-semibold text-text">
                            {a.icon || '▶'} {a.name}
                          </Link>
                          <div className="mt-1 text-xs text-text3">
                            {busyElsewhere ? (
                              'Ativo em outro projeto'
                            ) : badge ? (
                              <span style={{ color: badge.fg }}>{badge.text}</span>
                            ) : (
                              'Ainda não executado neste projeto'
                            )}
                          </div>
                          {!canRun && (
                            <p className="text-xs text-warn">A ação deixou de ter parâmetro de repositório.</p>
                          )}
                        </div>
                        {active ? (
                          <>
                            {a.service?.runId && (
                              <button className="btn btn-sm" onClick={() => dock.openRun(a.service!.runId!)}>
                                Terminal
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-danger-outline"
                              disabled={stop.isPending || Boolean(error)}
                              onClick={() => stop.mutate({ actionId: a.id, repoPath: data.repo.path })}
                            >
                              Parar serviço
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={busyElsewhere || !data.repo.imported || !canRun || Boolean(error)}
                            onClick={() => launch(a, data.repo)}
                          >
                            {a.persistent ? 'Iniciar aqui' : 'Executar aqui'}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <section aria-label="Portas do projeto" className="card mt-4 p-4">
            <h3 className="card-title m-0 mb-3">Portas do projeto</h3>
            <p className="text-xs text-text3">
              Somente execuções ativas iniciadas pelo macpit e seus processos filhos. Portas esperadas não contam como
              portas abertas.
            </p>
            {data.portsLimited && (
              <p className="text-xs text-warn">
                A coleta está limitada aos processos visíveis para o usuário do servidor.
              </p>
            )}
            {!data.ports.length && <p className="text-sm text-text3">Nenhuma porta vinculada encontrada.</p>}
            {data.ports.map((p) => (
              <div
                key={`${p.protocol}:${p.port}:${p.pid}`}
                className="list-row flex flex-wrap items-center gap-3 py-2 text-sm"
              >
                <Link to={`/ports?q=${p.port}`} className="font-mono text-accent">
                  {p.protocol} :{p.port}
                </Link>
                <span>{p.command}</span>
                <span className="text-text3">{p.scope === 'local' ? 'local' : 'rede'}</span>
                <Link to={`/processes?pid=${p.pid}`} className="text-accent">
                  PID {p.pid} →
                </Link>
              </div>
            ))}
          </section>
          <section aria-label="Execuções do projeto" className="card mt-4 p-4">
            <h3 className="card-title m-0 mb-3">Execuções do projeto</h3>
            <p className="text-xs text-text3">
              Até 50 recentes e todas as ativas. Execuções antigas sem vínculo de projeto não aparecem.
            </p>
            {!data.runs.length && <p className="text-sm text-text3">Nenhuma execução registrada neste projeto.</p>}
            {data.runs.map((r) => {
              const badge = runStyle(r);
              return (
                <button
                  key={r.id}
                  onClick={() => dock.openRun(r.id)}
                  className="list-row flex w-full flex-wrap items-center gap-3 border-0 bg-transparent py-3 text-left text-sm"
                >
                  <span className="min-w-0 flex-1 font-medium">{r.actionName}</span>
                  <span style={{ color: badge.fg }}>{badge.text}</span>
                  <span className="text-xs text-text3">{fmtShort(r.startedAt)}</span>
                  <span className="text-accent">{r.status === 'running' ? 'Terminal →' : 'Log →'}</span>
                </button>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

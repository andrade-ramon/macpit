import type { Action, ActionParam, Repo } from '@macpit/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useHealth } from '../../hooks/useHealth';
import { fmtDur, fmtShort } from '../../lib/format';
import { useRepos } from '../repos/useRepos';
import { useDock } from '../terminal/DockContext';
import { RUN_STYLE } from '../terminal/runStyle';
import { actionState, useTick } from './ActionCard';
import { applyRepoVars, describeRun, findRepo, initialParamValues, repoProvided, runDurationMs } from './actionUtils';
import { filledParams, useRuns, useStartRun } from './useActions';

function defaultValues(
  params: readonly ActionParam[],
  repoParam: ActionParam | undefined,
  repos: readonly Repo[],
  preselect?: string,
) {
  const base = initialParamValues(params);
  if (!repoParam) return base;
  const r = findRepo(repos, preselect) ?? findRepo(repos, repoParam.default);
  return applyRepoVars(params, { ...base, [repoParam.name]: r?.id ?? '' }, r);
}

interface Props {
  action: Action;
  /** Repositório pré-escolhido (ex.: "Executar aqui" na página Repositórios). */
  repoId?: string;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onStop: () => void;
}

/** Coluna de detalhes da ação: parâmetros desta execução, executar/parar, comando exato e histórico. */
export function ActionDetail({ action, repoId, onClose, onEdit, onDuplicate, onStop }: Props) {
  const dock = useDock();
  const start = useStartRun();
  const { data: health } = useHealth();
  const { data: history } = useRuns(action.id, 10);
  const { data: repoList, isPending: reposLoading } = useRepos();
  const repos = (repoList?.repos ?? []).filter((r) => r.imported);
  const repoParam = action.params.find((p) => p.type === 'repo');
  // `undefined` = ainda não mexeu: usa o repositório padrão (e as variáveis dele) assim que a lista chega
  const [edited, setValues] = useState<Record<string, string> | undefined>(
    repoParam ? undefined : initialParamValues(action.params),
  );
  const values = edited ?? defaultValues(action.params, repoParam, repos, repoId);
  const repo = repoParam ? findRepo(repos, values[repoParam.name]) : undefined;
  const provided = repoProvided(action.params, repo);
  const missing = action.params.filter(
    (p) => !values[p.name] && (p.type === 'repo' || (p.default === undefined && !provided.has(p.name.toLowerCase()))),
  );
  const now = useTick(action.service?.state === 'restarting');
  const { running, runId } = actionState(action, now);

  const run = () => {
    if (missing.length) return;
    start.mutate({ actionId: action.id, params: filledParams(values) }, { onSuccess: (r) => dock.openRun(r.id) });
  };
  const kind = action.persistent
    ? `serviço${action.autoRestart ? ' · reinicia se cair' : ''}${action.autoStart ? ' · inicia no login' : ''}`
    : `${action.group || 'sem grupo'}${action.params.length ? ` · pede ${action.params.map((p) => p.label || p.name).join(', ')}` : ''}`;

  return (
    <>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-panel2 text-[22px]">
          {action.icon || (action.persistent ? '⇄' : '▶')}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-xl font-semibold tracking-[-0.01em]">{action.name}</h2>
          <div className="text-[12.5px] text-text2">{kind}</div>
        </div>
        <button onClick={onClose} aria-label="Fechar detalhes" className="btn btn-icon">
          ✕
        </button>
      </div>

      {action.params.length > 0 && (
        <form
          id="action-params"
          className="tile flex flex-col gap-2.5 p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <span className="eyebrow">Parâmetros para esta execução</span>
          {action.params.map((p, i) =>
            p.type === 'repo' ? (
              <label key={p.name} className="flex flex-col gap-1 text-[13px]">
                <span className="text-text2">
                  {p.label || 'Repositório'} <code className="text-text3">{`{{${p.name}}}`}</code>
                </span>
                <select
                  autoFocus={i === 0}
                  value={values[p.name] ?? ''}
                  onChange={(e) => {
                    const r = findRepo(repos, e.target.value);
                    setValues(applyRepoVars(action.params, { ...values, [p.name]: e.target.value }, r));
                  }}
                  className="input h-10"
                >
                  <option value="">{reposLoading ? 'carregando…' : 'escolher repositório…'}</option>
                  {repos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.github ?? r.name}
                      {r.branch ? ` (${r.branch})` : ''}
                      {r.vars.length ? ` · ${r.vars.length} var.` : ''}
                    </option>
                  ))}
                </select>
                {repo && <span className="truncate font-mono text-xs text-text3">{repo.path}</span>}
                {repoList && repos.length === 0 && (
                  <span className="text-xs text-warn">
                    Nenhum repositório importado. Configure em <Link to="/repos">Repositórios</Link>.
                  </span>
                )}
              </label>
            ) : (
              <label key={p.name} className="flex flex-col gap-1 text-[13px]">
                <span className="text-text2">
                  {p.label || p.name} <code className="text-text3">{`{{${p.name}}}`}</code>
                </span>
                <input
                  type={p.secret ? 'password' : 'text'}
                  autoFocus={i === 0}
                  autoComplete={p.secret ? 'off' : undefined}
                  value={values[p.name] ?? ''}
                  onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
                  placeholder={
                    provided.has(p.name.toLowerCase()) && p.secret
                      ? `valor salvo em ${repo?.name}`
                      : p.default !== undefined && !p.secret
                        ? `padrão: ${p.default}`
                        : p.default !== undefined
                          ? 'padrão salvo'
                          : 'valor'
                  }
                  className="input h-10 font-mono"
                />
                {provided.has(p.name.toLowerCase()) && (
                  <span className="text-xs text-text3">variável do repositório {repo?.name}</span>
                )}
              </label>
            ),
          )}
        </form>
      )}

      <div className="flex flex-col gap-2">
        {running ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => runId && dock.openRun(runId)}
              disabled={!runId}
              className="btn btn-xl btn-primary font-bold"
            >
              Abrir terminal
            </button>
            <button onClick={onStop} className="btn btn-xl btn-danger-outline">
              ■ Parar
            </button>
          </div>
        ) : (
          <button
            type={action.params.length ? 'submit' : 'button'}
            form={action.params.length ? 'action-params' : undefined}
            onClick={action.params.length ? undefined : run}
            disabled={missing.length > 0 || start.isPending}
            className="btn btn-xl btn-primary w-full font-bold"
          >
            {start.isPending ? 'Iniciando…' : action.persistent ? '▶ Iniciar' : '▶ Executar'}
          </button>
        )}
        {start.error && <p className="m-0 text-[13px] text-danger">{start.error.message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onEdit} className="btn btn-md">
            Editar
          </button>
          <button onClick={onDuplicate} className="btn btn-md">
            Duplicar
          </button>
        </div>
      </div>

      <div>
        <div className="eyebrow mb-1.5">Comando exato</div>
        <pre className="term-box text-[12.5px]">
          {action.cwd || (repoParam ? '<repositório>' : '~')}$ {action.command}
        </pre>
        <p className="m-0 mt-1.5 text-xs text-text3">
          Roda em <code>$MACPIT_SHELL -lc</code> como{' '}
          <strong className={health?.isRoot ? 'text-danger' : 'text-text2'}>{health?.user ?? '…'}</strong>
          {health?.isRoot && ' (ROOT)'}. Valores de parâmetros vão como variáveis de ambiente — nunca colados no texto.
        </p>
      </div>

      {action.persistent && (
        <dl className="tile m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 p-3.5 text-[13px]">
          <dt className="text-text3">Serviço</dt>
          <dd className="m-0">fica rodando; status pela porta</dd>
          <dt className="text-text3">Porta esperada</dt>
          <dd className="m-0 font-mono">{action.expectedPort ? `:${action.expectedPort}` : '—'}</dd>
          <dt className="text-text3">Se cair</dt>
          <dd className="m-0">
            {action.autoRestart ? 'reinicia automaticamente (2s, 4s, 8s… até 60s)' : 'fica parado'}
          </dd>
          <dt className="text-text3">No login</dt>
          <dd className="m-0">{action.autoStart ? 'inicia junto com o macpit' : 'não inicia'}</dd>
        </dl>
      )}

      <div>
        <div className="eyebrow mb-1.5">Histórico desta ação</div>
        <div className="flex flex-col gap-0.5">
          {(history ?? []).map((r) => (
            <button
              key={r.id}
              onClick={() => dock.openRun(r.id)}
              className="grid h-[38px] grid-cols-[8px_1fr_auto] items-center gap-2.5 rounded-[9px] border-0 bg-transparent px-2.5 text-left hover:bg-panel2"
            >
              <span className="dot" style={{ background: RUN_STYLE[r.status].dot }} />
              <span className="text-[13px]">
                {describeRun(r)} <span className="text-text3">· {fmtShort(r.startedAt)}</span>
              </span>
              <span className="font-mono text-[11.5px] text-text3">
                {r.status === 'running' ? 'rodando' : fmtDur(runDurationMs(r) / 1000)}
              </span>
            </button>
          ))}
          {history?.length === 0 && <span className="px-2.5 text-[13px] text-text3">nunca executada</span>}
        </div>
      </div>
    </>
  );
}

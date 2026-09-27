import type { Action, ActionInput, ActionParam } from '@macpit/shared';
import { PARAM_NAME_RE, validateTemplate } from '@macpit/shared';
import { useEffect, useRef, useState } from 'react';
import { useHealth } from '../../hooks/useHealth';
import { useRepos } from '../repos/useRepos';
import { ENV_KEY_RE, envToRows, findRepo, missingParams, rowsToEnv, type EnvRow } from './actionUtils';
import { useDeleteAction, useSaveAction } from './useActions';

interface Props {
  /** `undefined` = nova ação. */
  action: Action | undefined;
  groups: string[];
  onClose: () => void;
  onSaved: (a: Action) => void;
}

export function ActionEditor({ action, groups, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data: health } = useHealth();
  const save = useSaveAction();
  const del = useDeleteAction();
  const { data: repoList } = useRepos();
  const repos = (repoList?.repos ?? []).filter((r) => r.imported);
  const [name, setName] = useState(action?.name ?? '');
  const [command, setCommand] = useState(action?.command ?? '');
  const [cwd, setCwd] = useState(action?.cwd ?? '');
  const [group, setGroup] = useState(action?.group ?? '');
  const [icon, setIcon] = useState(action?.icon ?? '');
  const [favorite, setFavorite] = useState(action?.favorite ?? false);
  const [env, setEnv] = useState<EnvRow[]>(action ? envToRows(action.env) : []);
  const [params, setParams] = useState<ActionParam[]>(action?.params ?? []);
  const [persistent, setPersistent] = useState(action?.persistent ?? false);
  const [expectedPort, setExpectedPort] = useState(action?.expectedPort ? String(action.expectedPort) : '');
  const [autoRestart, setAutoRestart] = useState(action?.autoRestart ?? false);
  const [autoStart, setAutoStart] = useState(action?.autoStart ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const badKeys = env.filter((r) => r.key.trim() && !ENV_KEY_RE.test(r.key.trim()));
  const badParams = params.filter((p) => !PARAM_NAME_RE.test(p.name));
  const missing = missingParams(command, params);
  const templateError = command.trim() && badParams.length === 0 ? validateTemplate(command, params) : undefined;
  const portNum = Number(expectedPort);
  const badPort = persistent && expectedPort !== '' && !(Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535);
  const repoParams = params.filter((p) => p.type === 'repo');
  const repoParam = repoParams[0];
  const defaultRepo = findRepo(repos, repoParam?.default);
  // variáveis do repositório padrão que ainda não viraram parâmetro
  const repoVarNames = (defaultRepo?.vars ?? [])
    .map((v) => v.name)
    .filter((n) => !params.some((p) => p.name.toLowerCase() === n.toLowerCase()));
  const noDefault = params
    .filter((p) => (p.type === 'repo' ? !p.default : !repoParam?.default && (!p.default || p.secret)))
    .map((p) => p.name || '(sem nome)');
  const autoStartBlocked =
    persistent && autoStart && noDefault.length > 0
      ? `defina um padrão não secreto para: ${noDefault.join(', ')}`
      : undefined;
  const valid =
    name.trim() &&
    command.trim() &&
    badKeys.length === 0 &&
    badParams.length === 0 &&
    repoParams.length <= 1 &&
    !templateError &&
    !badPort &&
    !autoStartBlocked;

  const submit = () => {
    if (!valid) return;
    const input: ActionInput = {
      name,
      command,
      cwd,
      group,
      icon,
      favorite,
      env: rowsToEnv(env),
      params: params.map((p) => ({ ...p, default: p.default === '' ? undefined : p.default })),
      persistent,
      autoRestart: persistent && autoRestart,
      autoStart: persistent && autoStart,
      ...(persistent && expectedPort ? { expectedPort: portNum } : {}),
    };
    save.mutate({ ...(action ? { id: action.id } : {}), input }, { onSuccess: onSaved });
  };

  const setParam = (i: number, patch: Partial<ActionParam>) =>
    setParams((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const setRow = (i: number, patch: Partial<EnvRow>) =>
    setEnv((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-full max-w-3xl modal"
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-lg font-semibold">{action ? 'Editar ação' : 'Nova ação'}</h2>

        <div className="grid grid-cols-[72px_1fr] gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-text2">Ícone</span>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={8}
              placeholder="🔌"
              className="input w-full text-center"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-text2">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="Túnel banco produção"
              className="input w-full"
              autoFocus
            />
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-text2">Comando</span>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            required
            rows={4}
            spellCheck={false}
            placeholder="ssh -N -L 5432:db.interno:5432 bastion    # ou ~/scripts/tunel.sh, ou um alias"
            className="input w-full font-mono"
          />
          <span className="block text-xs text-text3">
            Executado como <code>{'$MACPIT_SHELL -lc "…"'}</code> (shell de login: carrega seu perfil, PATH e aliases do
            bash) como <strong className={health?.isRoot ? 'text-danger' : ''}>{health?.user ?? '…'}</strong>
            {health?.isRoot && ' — ROOT'}. Use <code>{'{{nome}}'}</code> para pedir um valor na hora de executar.
          </span>
          {templateError && <span className="block text-xs text-danger">{templateError}</span>}
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm text-text2">Parâmetros</legend>
          {params.map((p, i) => (
            <div
              key={i}
              className="grid grid-cols-[96px_minmax(0,110px)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-2 [&>*]:min-w-0"
            >
              <select
                value={p.type}
                onChange={(e) =>
                  setParam(i, { type: e.target.value as ActionParam['type'], default: undefined, secret: false })
                }
                aria-label="Tipo do parâmetro"
                className="input"
              >
                <option value="text">texto</option>
                <option value="repo">repositório</option>
              </select>
              <input
                value={p.name}
                onChange={(e) => setParam(i, { name: e.target.value })}
                placeholder="nome"
                aria-label="Nome do parâmetro"
                className={`input font-mono ${PARAM_NAME_RE.test(p.name) ? '' : 'border-danger'}`}
              />
              <input
                value={p.label ?? ''}
                onChange={(e) => setParam(i, { label: e.target.value })}
                placeholder="rótulo (opcional)"
                aria-label="Rótulo"
                className="input"
              />
              {p.type === 'repo' ? (
                <select
                  value={p.default ?? ''}
                  onChange={(e) => setParam(i, { default: e.target.value || undefined })}
                  aria-label="Repositório padrão"
                  className="input"
                >
                  <option value="">sem padrão (escolher ao executar)</option>
                  {p.default && !findRepo(repos, p.default) && (
                    <option value={p.default}>{p.default} (não encontrado)</option>
                  )}
                  {repos.map((r) => (
                    <option key={r.id} value={r.github ?? r.path}>
                      {r.github ?? r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={p.default ?? ''}
                  onChange={(e) => setParam(i, { default: e.target.value })}
                  placeholder="padrão (opcional)"
                  aria-label="Valor padrão"
                  type={p.secret ? 'password' : 'text'}
                  className="input font-mono"
                />
              )}
              <label
                className={`flex items-center gap-1 text-xs text-text2 ${p.type === 'repo' ? 'invisible' : ''}`}
                title="Campo de senha; o valor digitado não é salvo"
              >
                <input type="checkbox" checked={p.secret} onChange={(e) => setParam(i, { secret: e.target.checked })} />{' '}
                segredo
              </label>
              <button
                type="button"
                onClick={() => setParams((ps) => ps.filter((_, j) => j !== i))}
                className="btn btn-sm"
                aria-label="Remover parâmetro"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setParams((ps) => [...ps, { name: '', secret: false, type: 'text' }])}
              className="btn btn-sm"
            >
              + Parâmetro
            </button>
            {!repoParam && (
              <button
                type="button"
                onClick={() =>
                  setParams((ps) => [{ name: 'repo', label: 'Repositório', secret: false, type: 'repo' }, ...ps])
                }
                className="btn btn-sm"
                title="Escolher o repositório ao executar: roda na pasta dele e usa as variáveis salvas em Repositórios"
              >
                + Repositório
              </button>
            )}
            {repoVarNames.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setParams((ps) => [
                    ...ps,
                    ...repoVarNames.map((name) => ({ name, secret: false, type: 'text' as const })),
                  ])
                }
                className="btn btn-sm btn-primary"
              >
                Usar variáveis de {defaultRepo?.name}: {repoVarNames.join(', ')}
              </button>
            )}
            {missing.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setParams((ps) => [...ps, ...missing.map((name) => ({ name, secret: false, type: 'text' as const }))])
                }
                className="btn btn-sm btn-primary"
              >
                Declarar {missing.map((m) => `{{${m}}}`).join(', ')}
              </button>
            )}
          </div>
          <p className="text-xs text-text3">
            Os valores chegam ao shell como variáveis de ambiente, nunca colados no texto — são seguros contra injeção.
            Não coloque <code>{'{{…}}'}</code> dentro de aspas simples.
            {repoParam && (
              <>
                {' '}
                Com um <strong>repositório</strong>: a ação roda na pasta dele (se o diretório abaixo estiver vazio),{' '}
                <code>{`{{${repoParam.name || 'repo'}}}`}</code> vira o caminho e parâmetros com o mesmo nome de uma
                variável do repo são preenchidos com ela (configure em <em>Repositórios</em>). Também ficam disponíveis{' '}
                <code>$MACPIT_REPO_NAME</code>, <code>$MACPIT_REPO_BRANCH</code> e <code>$MACPIT_REPO_GITHUB</code>.
              </>
            )}
          </p>
          {repoParams.length > 1 && (
            <p className="text-xs text-danger">Só pode haver um parâmetro do tipo repositório.</p>
          )}
        </fieldset>

        <fieldset className="space-y-2 rounded-lg border border-line p-3">
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} />É um serviço
            (fica rodando, ex.: túnel, servidor de dev)
          </label>
          {persistent && (
            <div className="grid gap-3 pl-6 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-text2">Porta esperada em localhost (opcional)</span>
                <input
                  value={expectedPort}
                  onChange={(e) => setExpectedPort(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder="5432"
                  className={`input w-full font-mono ${badPort ? 'border-danger' : ''}`}
                />
                <span className="block text-xs text-text3">Mostra “conectado” quando a porta aceita conexão.</span>
              </label>
              <label className="flex items-start gap-2 pt-6 text-sm text-text2">
                <input
                  type="checkbox"
                  checked={autoRestart}
                  onChange={(e) => setAutoRestart(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Reiniciar automaticamente se cair
                  <span className="block text-xs text-text3">Espera 2s, 4s, 8s… até 60s entre tentativas.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-text2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Iniciar junto com o macpit
                  <span className="block text-xs text-text3">
                    Com o LaunchAgent (<code>scripts/install-launchagent.sh</code>), sobe ao fazer login no Mac.
                    Parâmetros usam o valor padrão — todos precisam ter um (e não podem ser secretos).
                  </span>
                  {autoStartBlocked && <span className="block text-xs text-danger">{autoStartBlocked}</span>}
                </span>
              </label>
            </div>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-text2">Diretório (opcional)</span>
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="~ ou /caminho/do/projeto"
              className="input w-full font-mono"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-text2">Grupo (opcional)</span>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              list="action-groups"
              maxLength={40}
              placeholder="Infra, Projeto X…"
              className="input w-full"
            />
            <datalist id="action-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm text-text2">Variáveis de ambiente</legend>
          {env.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={r.key}
                onChange={(e) => setRow(i, { key: e.target.value })}
                placeholder="NOME"
                aria-label="Nome da variável"
                className={`input w-40 font-mono ${r.key.trim() && !ENV_KEY_RE.test(r.key.trim()) ? 'border-danger' : ''}`}
              />
              <input
                value={r.value}
                onChange={(e) => setRow(i, { value: e.target.value })}
                placeholder="valor"
                aria-label="Valor"
                className="input flex-1 font-mono"
              />
              <button
                type="button"
                onClick={() => setEnv((rows) => rows.filter((_, j) => j !== i))}
                className="btn btn-sm"
                aria-label="Remover variável"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEnv((rows) => [...rows, { key: '', value: '' }])}
            className="btn btn-sm"
          >
            + Variável
          </button>
          {badKeys.length > 0 && (
            <p className="text-xs text-danger">Nomes de variável: letras, números e _ (sem começar com número).</p>
          )}
          <p className="text-xs text-text3">
            Os valores ficam salvos em texto no banco local (0600). Evite senhas — prefira o seu keychain/ssh-agent.
          </p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-text2">
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Favorita (aparece
          primeiro)
        </label>

        {(save.error || del.error) && <p className="text-sm text-danger">{(save.error ?? del.error)?.message}</p>}

        <div className="flex items-center gap-2 border-t border-line pt-4">
          {action &&
            (confirmDelete ? (
              <>
                <span className="text-sm text-danger">
                  Remover “{action.name}”? O histórico de execuções é mantido.
                </span>
                <button
                  type="button"
                  onClick={() => del.mutate(action.id, { onSuccess: onClose })}
                  className="btn btn-sm btn-danger"
                >
                  Remover
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-sm">
                  Não
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="btn btn-sm">
                Remover
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="btn">
              Cancelar
            </button>
            <button type="submit" disabled={!valid || save.isPending} className="btn btn-primary">
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

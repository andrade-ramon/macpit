import { isStandalone } from '../lib/pwa';

/**
 * O app abriu (ex.: instalado, pela casca guardada no service worker) mas o servidor não responde.
 * A consulta de saúde tenta de novo a cada 5 s; ao voltar, o app aparece sozinho.
 */
export function ServerDownPage({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4 card p-6" role="alert">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
          <h1 className="text-xl font-semibold">O servidor do macpit não está rodando</h1>
        </div>
        <p className="text-sm text-text2">
          {isStandalone() ? 'O app instalado' : 'Esta página'} precisa do servidor local em <code>127.0.0.1</code>.
          Inicie com um dos comandos abaixo (na pasta do projeto):
        </p>
        <ul className="space-y-2 text-sm">
          <li>
            <pre className="term-box text-accent">./scripts/start.sh</pre>
            <span className="text-xs text-text3">roda enquanto o terminal estiver aberto</span>
          </li>
          <li>
            <pre className="term-box text-accent">./scripts/install-launchagent.sh</pre>
            <span className="text-xs text-text3">
              sobe sozinho ao fazer login no Mac (recomendado para o app instalado)
            </span>
          </li>
        </ul>
        <div className="flex items-center gap-3">
          <button onClick={onRetry} disabled={retrying} className="btn btn-primary">
            {retrying ? 'Verificando…' : 'Tentar agora'}
          </button>
          <span className="text-xs text-text3">tentando de novo a cada 5 s · {message}</span>
        </div>
      </div>
    </div>
  );
}

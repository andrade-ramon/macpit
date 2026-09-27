import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Sem sessão (1º acesso, cookie expirado após 30 dias sem uso, ou app instalado aberto num navegador novo).
 * Dá para entrar colando o token — ele vai no corpo do POST, não na URL.
 */
export function UnauthorizedPage() {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch('/auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'token inválido' : `erro ${res.status}`);
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4 card p-6">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
          <h1 className="text-xl font-semibold">Entrar no macpit</h1>
        </div>
        <p className="text-sm text-text2">
          O acesso é protegido por um token que só existe na sua máquina. O jeito mais fácil é abrir pelo terminal:
        </p>
        <pre className="term-box text-accent">./scripts/open.sh</pre>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) void submit();
          }}
        >
          <label className="block text-sm text-text2" htmlFor="token">
            Ou cole o token aqui
          </label>
          <input
            id="token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="64 caracteres"
            className="input w-full font-mono"
          />
          <p className="text-xs text-text3">
            Para copiar: <code>pbcopy &lt; ~/.macpit/token</code>. A sessão dura 30 dias sem uso e é renovada sozinha
            enquanto você usa.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={!token.trim() || busy} className="btn btn-primary">
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

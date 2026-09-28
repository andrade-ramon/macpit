import { AI_MODELS, type AiProvider, type AiPublicSettings } from '@macpit/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { AI_SETTINGS_KEY, useAiSettings } from './useAi';

export function AiSettings() {
  const { data, error, refetch } = useAiSettings();
  return (
    <section id="settings-ai" className="card flex max-w-[820px] scroll-mt-4 flex-col gap-3.5">
      <h2 className="m-0 text-base font-semibold">IA para criar ações</h2>
      <p className="m-0 text-[13px] text-text2">
        Descreva o que deseja e revise a ação antes de salvar. Chamadas, inclusive o teste, podem gerar cobrança no
        provedor.
      </p>
      {error && (
        <div role="alert" className="text-danger">
          {error.message}{' '}
          <button className="btn btn-sm" onClick={() => void refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {data && <AiSettingsForm settings={data} />}
    </section>
  );
}

function AiSettingsForm({ settings }: { settings: AiPublicSettings }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [apiKey, setApiKey] = useState('');
  const [storage, setStorage] = useState<'session' | 'disk'>(settings.storage ?? 'session');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>();
  const changed = provider !== settings.provider || model !== settings.model;

  async function perform(work: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await work();
      setNotice({ ok: true, text: message });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'não foi possível concluir' });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    perform(async () => {
      const configured = await api<AiPublicSettings>('/api/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({ provider, model }),
      });
      qc.setQueryData(AI_SETTINGS_KEY, configured);
      if (apiKey.trim()) {
        const saved = await api<AiPublicSettings>('/api/ai/credential', {
          method: 'PUT',
          body: JSON.stringify({ provider, apiKey, storage }),
        });
        setApiKey('');
        qc.setQueryData(AI_SETTINGS_KEY, saved);
      }
    }, 'Configuração salva. Use Testar conexão para verificar o modelo e a chave.');

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={busy} className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Provedor de IA
          <select
            className="input w-full"
            value={provider}
            onChange={(e) => {
              const next = e.target.value as AiProvider;
              setProvider(next);
              setModel(AI_MODELS[next][0]);
              setApiKey('');
              setNotice(undefined);
            }}
          >
            <option value="gemini">Google Gemini</option>
            <option value="anthropic">Anthropic Claude</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Modelo de IA
          <select
            className="input w-full"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setNotice(undefined);
            }}
          >
            {AI_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          API key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={1024}
            className="input w-full font-mono"
            placeholder={
              settings.hasApiKey && provider === settings.provider
                ? 'Chave configurada — digite para substituir'
                : 'Cole a chave do provedor escolhido'
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Armazenamento da nova chave
          <select
            className="input w-full"
            value={storage}
            onChange={(e) => setStorage(e.target.value as 'session' | 'disk')}
          >
            <option value="session">Só até reiniciar o servidor</option>
            <option value="disk">Lembrar neste computador</option>
          </select>
        </label>
      </fieldset>
      <p className="m-0 text-xs text-text3">
        A chave fica no servidor e não é enviada às ações. “Lembrar” salva em texto num arquivo local 0600, sem
        criptografia. Para mudar o armazenamento, informe a chave novamente. Trocar de provedor remove a chave anterior.
      </p>
      <p className="m-0 text-sm text-text2">
        {settings.hasApiKey
          ? `Chave configurada · ${settings.storage === 'disk' ? 'lembrada neste computador' : 'sessão do servidor'}`
          : 'Nenhuma chave configurada'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? 'Aguarde…' : 'Salvar configuração de IA'}
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy || changed || !!apiKey || !settings.hasApiKey}
          onClick={() =>
            void perform(async () => {
              await api('/api/ai/test', { method: 'POST', body: '{}' });
            }, 'Conexão verificada: o modelo respondeu no formato de ações.')
          }
        >
          Testar conexão
        </button>
        <button
          className="btn btn-danger-outline"
          type="button"
          disabled={busy || !settings.hasApiKey}
          onClick={() =>
            void perform(async () => {
              const cleared = await api<AiPublicSettings>('/api/ai/credential', { method: 'DELETE' });
              setApiKey('');
              qc.setQueryData(AI_SETTINGS_KEY, cleared);
            }, 'Chave removida.')
          }
        >
          Remover chave
        </button>
      </div>
      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={`m-0 text-sm ${notice.ok ? 'text-accent' : 'text-danger'}`}>
          {notice.text}
        </p>
      )}
    </form>
  );
}

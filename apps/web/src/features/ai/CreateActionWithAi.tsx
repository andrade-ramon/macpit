import {
  aiActionInput,
  AiDraftRequestSchema,
  type Action,
  type AiDraftRequest,
  type AiDraftResponse,
  type AiResult,
} from '@macpit/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { ActionEditor } from '../actions/ActionEditor';
import { AiDraftReview } from './AiDraftReview';
import { useAiSettings } from './useAi';

export function CreateActionWithAi({
  groups,
  onClose,
  onSaved,
}: {
  groups: string[];
  onClose: () => void;
  onSaved: (action: Action) => void;
}) {
  const settings = useAiSettings();
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<AiDraftRequest['history']>([]);
  const [result, setResult] = useState<AiResult>();
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError('Solicitação cancelada. A cobrança já iniciada no provedor pode permanecer.');
  };
  async function generate() {
    if (controller.current) return;
    const parsed = AiDraftRequestSchema.safeParse({
      prompt,
      history,
      configuration: settings.data ? { provider: settings.data.provider, model: settings.data.model } : undefined,
    });
    if (!parsed.success) {
      setError(
        'Limite do pedido ou contexto atingido. Use até 8 mil caracteres e seis refinamentos; inicie outro pedido se necessário.',
      );
      return;
    }
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api<AiDraftResponse>('/api/ai/drafts', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
        signal: current.signal,
      });
      if (controller.current !== current || current.signal.aborted) return;
      setResult(response.result);
      setHistory([...history, { prompt: parsed.data.prompt, result: response.result }]);
      setPrompt('');
    } catch (e) {
      if (controller.current === current && !current.signal.aborted)
        setError(e instanceof Error ? e.message : 'Não foi possível gerar a ação.');
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  if (review && result?.action)
    return (
      <ActionEditor
        action={undefined}
        initialInput={aiActionInput(result.action)}
        assisted
        groups={groups}
        introduction={<AiDraftReview result={result} />}
        onClose={() => setReview(false)}
        onSaved={onSaved}
      />
    );

  return (
    <Modal open onClose={onClose} label="Criar ação com IA" className="max-w-[760px] p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold">Criar ação com IA</h2>
          <button className="btn btn-icon" aria-label="Fechar criação com IA" onClick={onClose}>
            ✕
          </button>
        </div>
        {settings.isPending && <p role="status">Carregando configuração…</p>}
        {settings.error && (
          <p role="alert" className="text-danger">
            {settings.error.message}{' '}
            <button className="btn btn-sm" onClick={() => void settings.refetch()}>
              Tentar novamente
            </button>
          </p>
        )}
        {settings.data && !settings.data.hasApiKey && (
          <p className="m-0 text-text2">
            Configure um provedor e sua API key para começar.{' '}
            <Link to="/settings#settings-ai" className="text-accent">
              Configurar IA
            </Link>
          </p>
        )}
        {settings.data?.hasApiKey && (
          <>
            <p className="m-0 text-xs text-text2">
              Destino: {settings.data.provider === 'gemini' ? 'Google Gemini' : 'Anthropic'} · {settings.data.model}.
              Seu pedido e este histórico serão enviados ao provedor. Não cole senhas ou tokens; peça parâmetros
              secretos. Arquivos, logs e variáveis locais não são enviados automaticamente.
            </p>
            {history.length > 0 && (
              <details className="text-sm text-text2">
                <summary className="cursor-pointer">Pedidos enviados ({history.length})</summary>
                <ol className="pl-5">
                  {history.map((entry, i) => (
                    <li className="whitespace-pre-wrap break-words" key={i}>
                      {entry.prompt}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {result && <AiDraftReview result={result} />}
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                {result ? 'Responda ou peça um ajuste' : 'O que você quer fazer?'}
                <textarea
                  autoFocus
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={busy}
                  maxLength={8000}
                  rows={4}
                  className="input w-full resize-y"
                  placeholder="Quero um túnel SSH para acessar meu banco pela porta local 5433…"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !prompt.trim() || history.length > 6}
                >
                  {busy ? 'Gerando…' : result ? 'Enviar ajuste' : 'Gerar rascunho'}
                </button>
                {busy && (
                  <button type="button" className="btn" onClick={cancel}>
                    Cancelar geração
                  </button>
                )}
                {result?.action && (
                  <button type="button" className="btn" disabled={busy} onClick={() => setReview(true)}>
                    Revisar e criar ação
                  </button>
                )}
                {history.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      setHistory([]);
                      setResult(undefined);
                      setError(undefined);
                    }}
                  >
                    Novo pedido
                  </button>
                )}
              </div>
            </form>
            {busy && (
              <p role="status" className="m-0 text-xs text-text2">
                Aguardando o provedor, por até 45 segundos. Nenhum comando está sendo executado.
              </p>
            )}
            {error && (
              <p role="alert" className="m-0 text-sm text-danger">
                {error}
              </p>
            )}
            {history.length > 6 && (
              <p className="m-0 text-sm text-text2">
                Limite de refinamentos atingido. Revise a ação ou inicie outro pedido.
              </p>
            )}
            <p className="m-0 text-xs text-text3">
              A IA pode errar. Confira o comando e seus efeitos antes de criar. Salvar não executa a ação.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

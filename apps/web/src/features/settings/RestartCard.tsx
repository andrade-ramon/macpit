import type { ServerStatus } from '@macpit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { api } from '../../lib/api';

export function RestartCard() {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [waiting, setWaiting] = useState<{ instanceId: string }>();
  const [timedOut, setTimedOut] = useState(false);
  const status = useQuery({
    queryKey: ['server-status'],
    queryFn: () => api<ServerStatus>('/api/server'),
    refetchInterval: waiting ? 1_000 : 10_000,
    retry: false,
  });
  const restart = useMutation({
    mutationFn: () =>
      api<ServerStatus>('/api/server/restart', { method: 'POST', body: JSON.stringify({ confirm: true }) }),
    onSuccess: (s) => {
      setConfirming(false);
      setTimedOut(false);
      qc.setQueryData(['server-status'], s);
      setWaiting({ instanceId: s.instanceId });
    },
  });
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(timer);
  }, [waiting]);
  useEffect(() => {
    if (waiting && status.data && status.data.instanceId !== waiting.instanceId) window.location.reload();
  }, [waiting, status.data]);
  const failure = waiting && status.data?.error;
  const busy = restart.isPending || Boolean(waiting && !timedOut && !failure) || status.data?.restarting;

  return (
    <section id="settings-server" className="card flex max-w-[820px] scroll-mt-4 flex-col gap-3.5">
      <h2 className="m-0 text-base font-semibold">Servidor do macpit</h2>
      <p className="m-0 text-[13px] text-text2">
        Reinicia apenas o macpit para carregar o código já compilado. As configurações e os painéis salvos são
        preservados.
      </p>
      {status.data && !status.data.canRestart && (
        <p className="m-0 text-sm text-warn">
          Disponível ao executar o build com Node compatível. No modo de desenvolvimento, reinicie pelo terminal.
        </p>
      )}
      {status.error && !waiting && (
        <p role="alert" className="m-0 text-sm text-danger">
          Não foi possível consultar o servidor: {status.error.message}
        </p>
      )}
      {restart.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {restart.error.message}
        </p>
      )}
      {failure && (
        <p role="alert" className="m-0 text-sm text-danger">
          {failure}
        </p>
      )}
      {waiting && !timedOut && !failure && (
        <p role="status" className="m-0 text-sm text-accent">
          Reiniciando o macpit… A página será recarregada quando o servidor voltar.
        </p>
      )}
      {timedOut && (
        <p role="alert" className="m-0 text-sm text-warn">
          O servidor ainda não confirmou o reinício. Verifique o macpit no terminal; continuaremos tentando reconectar.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-md"
          disabled={!status.data?.canRestart || Boolean(busy) || Boolean(status.error)}
          onClick={() => {
            restart.reset();
            setConfirming(true);
          }}
        >
          Reiniciar macpit
        </button>
        {(status.error || timedOut) && (
          <button className="btn btn-md" onClick={() => void status.refetch()}>
            Verificar conexão
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title="Reiniciar o macpit?"
        confirmLabel="Reiniciar macpit"
        busy={restart.isPending}
        hint="As execuções ativas serão encerradas. Serviços marcados para iniciar com o macpit voltarão automaticamente. O macOS não será reiniciado."
        onCancel={() => {
          if (!restart.isPending) setConfirming(false);
        }}
        onConfirm={() => restart.mutate()}
      >
        <p className="m-0 text-sm text-text2">Execuções ativas agora: {status.data?.activeRuns ?? '…'}</p>
        {restart.error && (
          <p role="alert" className="text-danger">
            {restart.error.message}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}

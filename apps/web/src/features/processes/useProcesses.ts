import type { KillResult, KillSignal, ProcessDetail, ProcessList } from '@macpit/shared';
import { Channels } from '@macpit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useChannel } from '../../hooks/useChannel';
import { api } from '../../lib/api';

/** Snapshot inicial por REST + atualizações ao vivo do canal `processes`. */
export function useProcesses() {
  const initial = useQuery({ queryKey: ['processes'], queryFn: () => api<ProcessList>('/api/processes') });
  const live = useChannel<ProcessList>(Channels.processes);
  const data = live && (!initial.data || live.ts >= initial.data.ts) ? live : initial.data;
  return { data, error: initial.error };
}

export function useProcessDetail(pid: number | undefined) {
  return useQuery({
    queryKey: ['process', pid],
    queryFn: () => api<ProcessDetail>(`/api/processes/${pid}`),
    enabled: pid !== undefined,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useKillProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pid, signal }: { pid: number; signal: KillSignal }) =>
      api<KillResult>(`/api/processes/${pid}/kill`, { method: 'POST', body: JSON.stringify({ signal }) }),
    onSuccess: (_r, { pid }) => {
      void qc.invalidateQueries({ queryKey: ['process', pid] });
    },
  });
}

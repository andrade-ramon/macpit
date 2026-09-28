import type { Panel } from '@macpit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const KEY = ['panels'];

export function usePanels() {
  return useQuery({ queryKey: KEY, queryFn: () => api<Panel[]>('/api/panels'), refetchInterval: 5_000 });
}

export function useSavePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api<Panel>('/api/panels', { method: 'POST', body: JSON.stringify({ repoId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemovePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/panels/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

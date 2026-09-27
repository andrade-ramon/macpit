import type { DiskHistory, DiskOverview, DiskRange, DiskSettings, DiskUsage } from '@macpit/shared';
import { Channels } from '@macpit/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useChannel } from '../../hooks/useChannel';
import { api } from '../../lib/api';

/** Volumes: REST inicial + canal `disk` ao vivo. */
export function useDisk() {
  const initial = useQuery({ queryKey: ['disk'], queryFn: () => api<DiskOverview>('/api/disk') });
  const live = useChannel<DiskOverview>(Channels.disk);
  const data = live && (!initial.data || live.ts >= initial.data.ts) ? live : initial.data;
  return { data, error: initial.error };
}

export function useDiskHistory(mount: string | undefined, range: DiskRange) {
  return useQuery({
    queryKey: ['disk-history', mount, range],
    queryFn: () => api<DiskHistory>(`/api/disk/history?mount=${encodeURIComponent(mount!)}&range=${range}`),
    enabled: Boolean(mount),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useDiskSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: DiskSettings) =>
      api<DiskSettings>('/api/disk/settings', { method: 'PUT', body: JSON.stringify(s) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['disk'] }),
  });
}

export function useDiskUsage(path: string | undefined, refreshToken: number) {
  return useQuery({
    // refreshToken > 0 força o servidor a ignorar o cache
    queryKey: ['disk-usage', path, refreshToken],
    queryFn: () =>
      api<DiskUsage>(`/api/disk/usage?path=${encodeURIComponent(path!)}${refreshToken ? '&refresh=1' : ''}`),
    enabled: Boolean(path),
    staleTime: Infinity,
    retry: false,
  });
}

import type { PortList } from '@macpit/shared';
import { Channels } from '@macpit/shared';
import { useQuery } from '@tanstack/react-query';
import { useChannel } from '../../hooks/useChannel';
import { api } from '../../lib/api';

/** Lista inicial por REST + atualização ao vivo do canal `ports`. */
export function usePorts() {
  const initial = useQuery({ queryKey: ['ports'], queryFn: () => api<PortList>('/api/ports') });
  const live = useChannel<PortList>(Channels.ports);
  const data = live && (!initial.data || live.ts >= initial.data.ts) ? live : initial.data;
  return { data, error: initial.error };
}

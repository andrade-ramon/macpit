import type { Health } from '@macpit/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/api/health'),
    // com erro (servidor parado, ex.: app instalado aberto antes do servidor), tenta a cada 5 s
    refetchInterval: (q) => (q.state.status === 'error' ? 5_000 : 30_000),
  });
}

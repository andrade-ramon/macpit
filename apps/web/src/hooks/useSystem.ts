import type { SystemOverview, SystemSample } from '@macpit/shared';
import { Channels, SYSTEM_HISTORY_WINDOW_MS } from '@macpit/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { mergeHistory } from '../lib/history';
import { getWsClient } from '../lib/ws';

/** Histórico inicial via REST + amostras ao vivo pelo canal `system`. */
export function useSystem() {
  const { data: initial, error } = useQuery({
    queryKey: ['system'],
    queryFn: () => api<SystemOverview>('/api/system'),
    staleTime: Infinity,
  });
  const [live, setLive] = useState<SystemSample[]>([]);

  useEffect(
    () =>
      getWsClient().subscribe(Channels.system, (data) =>
        setLive((prev) => mergeHistory(prev, [data as SystemSample], SYSTEM_HISTORY_WINDOW_MS)),
      ),
    [],
  );

  const history = useMemo(() => mergeHistory(initial?.history ?? [], live, SYSTEM_HISTORY_WINDOW_MS), [initial, live]);
  return { current: history.at(-1) ?? initial?.current, history, error };
}

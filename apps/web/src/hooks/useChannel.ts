import { useEffect, useState, useSyncExternalStore } from 'react';
import { getWsClient, type WsStatus } from '../lib/ws';

/** Assina um canal WS enquanto o componente estiver montado e retorna o último snapshot. */
export function useChannel<T>(channel: string | undefined): T | undefined {
  // Guarda o canal junto do dado para descartar snapshots de um canal anterior sem setState no efeito.
  const [state, setState] = useState<{ channel: string; data: T } | undefined>(undefined);
  useEffect(() => {
    if (!channel) return;
    return getWsClient().subscribe(channel, (data) => setState({ channel, data: data as T }));
  }, [channel]);
  return state && state.channel === channel ? state.data : undefined;
}

/**
 * Estado da conexão WS. Também **abre** a conexão: sem isso, páginas que não assinam nenhum canal
 * (ex.: Ações antes de abrir um terminal) ficariam mostrando "desconectado".
 */
export function useWsStatus(): WsStatus {
  const client = getWsClient();
  return useSyncExternalStore(
    (cb) => {
      const off = client.onStatus(cb);
      client.connect();
      return off;
    },
    () => client.getStatus(),
  );
}

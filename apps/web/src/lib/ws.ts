import type { ClientMessage, ServerMessage } from '@macpit/shared';

export type WsStatus = 'connecting' | 'open' | 'closed';
type Listener = (data: unknown) => void;

interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;

/**
 * Cliente WS único da aplicação: reconecta com backoff, contabiliza inscrições por canal
 * e reassina tudo ao reconectar.
 */
export class WsClient {
  private socket: SocketLike | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly statusListeners = new Set<(s: WsStatus) => void>();
  private status: WsStatus = 'closed';
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly factory: SocketFactory = (u) => new WebSocket(u) as unknown as SocketLike,
  ) {}

  subscribe(channel: string, listener: Listener): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      this.send({ type: 'subscribe', channel });
    }
    set.add(listener);
    this.connect();
    return () => {
      const current = this.listeners.get(channel);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(channel);
        this.send({ type: 'unsubscribe', channel });
      }
    };
  }

  onStatus(listener: (s: WsStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): WsStatus {
    return this.status;
  }

  connect(): void {
    if (this.socket || this.stopped) return;
    this.setStatus('connecting');
    const socket = this.factory(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      for (const channel of this.listeners.keys()) this.send({ type: 'subscribe', channel });
    };
    socket.onmessage = (ev) => this.handle(String(ev.data));
    socket.onclose = () => {
      this.socket = undefined;
      this.setStatus('closed');
      if (this.stopped) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }

  private handle(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (msg.type === 'snapshot') {
      for (const l of this.listeners.get(msg.channel) ?? []) l(msg.data);
    } else if (msg.type === 'error') {
      console.warn('[ws]', msg.message, msg.channel ?? '');
    }
  }

  /** Envia uma mensagem (ex.: `run:input`); retorna `false` se desconectado. */
  send(msg: ClientMessage): boolean {
    if (this.socket?.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  private setStatus(status: WsStatus): void {
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }
}

function defaultUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

let shared: WsClient | undefined;
export function getWsClient(): WsClient {
  shared ??= new WsClient(defaultUrl());
  return shared;
}

import type { ClientMessage, ServerMessage } from '@macpit/shared';
import { ClientMessageSchema } from '@macpit/shared';

/** Mensagens do cliente que não são subscribe/unsubscribe (ex.: `run:input`). */
export type CommandMessage = Exclude<ClientMessage, { type: 'subscribe' | 'unsubscribe' }>;
export type CommandHandler = (msg: CommandMessage) => string | void;

/** Abstração mínima do socket (facilita testes). */
export interface HubSocket {
  send(data: string): void;
  on(event: 'message', listener: (data: unknown) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  readonly readyState: number;
}

const OPEN = 1;

export type Emit = (data: unknown) => void;

/** Um produtor de canal: inicia quando entra o 1º inscrito e para quando sai o último. */
export interface ChannelProducer {
  start(emit: Emit): () => void;
  /**
   * Snapshot enviado a **cada** novo inscrito, antes dos eventos ao vivo. Usado por canais de fluxo
   * (ex.: `run:<id>` reenvia o buffer do terminal); sem ele, quem entra depois recebe o último evento.
   */
  initial?(): unknown;
}

interface ChannelState {
  producer: ChannelProducer;
  subscribers: Set<HubSocket>;
  stop?: () => void;
  last?: unknown;
  /** Criado por um resolvedor: removido do mapa quando fica sem inscritos. */
  dynamic: boolean;
}

export interface HubLogger {
  warn(obj: unknown, msg?: string): void;
}

/** Produtor que coleta periodicamente e emite o resultado (primeira coleta imediata). */
export function polled(collect: () => unknown, intervalMs: number, logger?: HubLogger): ChannelProducer {
  return {
    start(emit) {
      let stopped = false;
      let running = false;
      const tick = async () => {
        if (running || stopped) return;
        running = true;
        try {
          const data = await collect();
          if (!stopped) emit(data);
        } catch (err) {
          logger?.warn({ err }, 'falha ao coletar canal');
        } finally {
          running = false;
        }
      };
      void tick();
      const timer = setInterval(() => void tick(), intervalMs);
      return () => {
        stopped = true;
        clearInterval(timer);
      };
    },
  };
}

export class WsHub {
  private readonly channels = new Map<string, ChannelState>();
  private readonly resolvers: Array<(name: string) => ChannelProducer | undefined> = [];
  private readonly commands = new Map<CommandMessage['type'], CommandHandler>();

  constructor(private readonly logger?: HubLogger) {}

  /** Trata uma mensagem de comando; se o handler retornar uma string, ela volta como `error`. */
  onCommand(type: CommandMessage['type'], handler: CommandHandler): void {
    this.commands.set(type, handler);
  }

  /** Registra um canal de nome fixo. */
  define(name: string, producer: ChannelProducer): void {
    if (this.channels.has(name)) throw new Error(`canal duplicado: ${name}`);
    this.channels.set(name, { producer, subscribers: new Set(), dynamic: false });
  }

  /** Registra um resolvedor para canais dinâmicos (ex.: `run:<id>`). */
  resolve(resolver: (name: string) => ChannelProducer | undefined): void {
    this.resolvers.push(resolver);
  }

  hasChannel(name: string): boolean {
    return this.channels.has(name);
  }

  subscriberCount(name: string): number {
    return this.channels.get(name)?.subscribers.size ?? 0;
  }

  attach(socket: HubSocket): void {
    const mine = new Set<string>();
    socket.on('message', (raw) => {
      let json: unknown;
      try {
        json = JSON.parse(String(raw));
      } catch {
        return send(socket, { type: 'error', message: 'JSON inválido' });
      }
      const parsed = ClientMessageSchema.safeParse(json);
      if (!parsed.success) return send(socket, { type: 'error', message: 'mensagem inválida' });
      const msg = parsed.data;
      if (msg.type === 'subscribe') {
        // Exceção dentro do listener do `ws` vira uncaught e derruba o servidor: isola aqui.
        try {
          if (this.subscribe(socket, msg.channel)) mine.add(msg.channel);
        } catch (err) {
          this.logger?.warn({ err, channel: msg.channel }, 'falha ao assinar canal');
          send(socket, { type: 'error', message: 'falha ao assinar canal', channel: msg.channel });
        }
      } else if (msg.type === 'unsubscribe') {
        this.unsubscribe(socket, msg.channel);
        mine.delete(msg.channel);
      } else {
        const handler = this.commands.get(msg.type);
        if (!handler) return send(socket, { type: 'error', message: `comando não suportado: ${msg.type}` });
        try {
          const error = handler(msg);
          if (error) send(socket, { type: 'error', message: error });
        } catch (err) {
          this.logger?.warn({ err }, 'falha ao tratar comando WS');
          send(socket, { type: 'error', message: 'falha ao processar comando' });
        }
      }
    });
    socket.on('close', () => {
      for (const channel of mine) this.unsubscribe(socket, channel, false);
      mine.clear();
    });
  }

  /** Para todos os produtores (shutdown). */
  close(): void {
    for (const state of this.channels.values()) {
      state.stop?.();
      state.stop = undefined;
      state.subscribers.clear();
    }
    for (const [name, state] of this.channels) if (state.dynamic) this.channels.delete(name);
  }

  private lookup(name: string): ChannelState | undefined {
    const existing = this.channels.get(name);
    if (existing) return existing;
    for (const resolver of this.resolvers) {
      const producer = resolver(name);
      if (producer) {
        const state: ChannelState = { producer, subscribers: new Set(), dynamic: true };
        this.channels.set(name, state);
        return state;
      }
    }
    return undefined;
  }

  private subscribe(socket: HubSocket, name: string): boolean {
    const state = this.lookup(name);
    if (!state) {
      send(socket, { type: 'error', message: 'canal desconhecido', channel: name });
      return false;
    }
    if (state.subscribers.has(socket)) return true;
    state.subscribers.add(socket);
    send(socket, { type: 'subscribed', channel: name });
    if (state.producer.initial) {
      send(socket, { type: 'snapshot', channel: name, data: state.producer.initial() });
      if (state.subscribers.size === 1) state.stop = state.producer.start((data) => this.broadcast(name, state, data));
    } else if (state.subscribers.size === 1) {
      state.stop = state.producer.start((data) => {
        state.last = data;
        this.broadcast(name, state, data);
      });
    } else if (state.last !== undefined) {
      send(socket, { type: 'snapshot', channel: name, data: state.last });
    }
    return true;
  }

  private broadcast(name: string, state: ChannelState, data: unknown): void {
    const msg = JSON.stringify({ type: 'snapshot', channel: name, data } satisfies ServerMessage);
    for (const sub of state.subscribers) if (sub.readyState === OPEN) sub.send(msg);
  }

  private unsubscribe(socket: HubSocket, name: string, notify = true): void {
    const state = this.channels.get(name);
    if (!state?.subscribers.delete(socket)) return;
    if (notify) send(socket, { type: 'unsubscribed', channel: name });
    if (state.subscribers.size === 0) {
      state.stop?.();
      state.stop = undefined;
      state.last = undefined;
      if (state.dynamic) this.channels.delete(name);
    }
  }
}

function send(socket: HubSocket, msg: ServerMessage): void {
  if (socket.readyState === OPEN) socket.send(JSON.stringify(msg));
}

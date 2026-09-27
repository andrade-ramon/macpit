import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { polled, WsHub, type ChannelProducer } from '../src/ws/hub.js';

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  msg(obj: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(obj)));
  }
}

afterEach(() => vi.useRealTimers());

function manualProducer() {
  const state = { starts: 0, stops: 0, emit: undefined as undefined | ((d: unknown) => void) };
  const producer: ChannelProducer = {
    start(emit) {
      state.starts++;
      state.emit = emit;
      return () => state.stops++;
    },
  };
  return { state, producer };
}

describe('WsHub', () => {
  it('inicia produtor no 1º inscrito e para no último', () => {
    const hub = new WsHub();
    const { state, producer } = manualProducer();
    hub.define('demo', producer);
    const a = new FakeSocket();
    const b = new FakeSocket();
    hub.attach(a);
    hub.attach(b);

    a.msg({ type: 'subscribe', channel: 'demo' });
    b.msg({ type: 'subscribe', channel: 'demo' });
    expect(state.starts).toBe(1);

    state.emit?.({ n: 1 });
    expect(a.sent).toContainEqual({ type: 'snapshot', channel: 'demo', data: { n: 1 } });
    expect(b.sent).toContainEqual({ type: 'snapshot', channel: 'demo', data: { n: 1 } });

    a.msg({ type: 'unsubscribe', channel: 'demo' });
    expect(state.stops).toBe(0);
    b.emit('close');
    expect(state.stops).toBe(1);
    expect(hub.subscriberCount('demo')).toBe(0);
  });

  it('envia último snapshot para quem entra depois', () => {
    const hub = new WsHub();
    const { state, producer } = manualProducer();
    hub.define('demo', producer);
    const a = new FakeSocket();
    hub.attach(a);
    a.msg({ type: 'subscribe', channel: 'demo' });
    state.emit?.('x');

    const b = new FakeSocket();
    hub.attach(b);
    b.msg({ type: 'subscribe', channel: 'demo' });
    expect(b.sent).toEqual([
      { type: 'subscribed', channel: 'demo' },
      { type: 'snapshot', channel: 'demo', data: 'x' },
    ]);
  });

  it('responde erro para canal desconhecido e mensagens inválidas', () => {
    const hub = new WsHub();
    const s = new FakeSocket();
    hub.attach(s);
    s.msg({ type: 'subscribe', channel: 'nope' });
    s.emit('message', Buffer.from('{not json'));
    s.msg({ type: 'exec', cmd: 'rm -rf /' });
    expect(s.sent).toEqual([
      { type: 'error', message: 'canal desconhecido', channel: 'nope' },
      { type: 'error', message: 'JSON inválido' },
      { type: 'error', message: 'mensagem inválida' },
    ]);
  });

  it('initial() é enviado a cada inscrito antes dos eventos', () => {
    const hub = new WsHub();
    let emit: ((d: unknown) => void) | undefined;
    let n = 0;
    hub.define('flow', { initial: () => ({ replay: ++n }), start: (e) => ((emit = e), () => {}) });
    const a = new FakeSocket();
    const b = new FakeSocket();
    hub.attach(a);
    hub.attach(b);
    a.msg({ type: 'subscribe', channel: 'flow' });
    emit?.('x');
    b.msg({ type: 'subscribe', channel: 'flow' });
    expect(a.sent.filter((m) => m.type === 'snapshot').map((m) => m.data)).toEqual([{ replay: 1 }, 'x']);
    expect(b.sent.filter((m) => m.type === 'snapshot').map((m) => m.data)).toEqual([{ replay: 2 }]);
  });

  it('erro ao assinar não derruba o processo; comandos sem handler respondem erro', () => {
    const hub = new WsHub();
    hub.define('quebrado', {
      initial: () => {
        throw new Error('boom');
      },
      start: () => () => {},
    });
    const s = new FakeSocket();
    hub.attach(s);
    expect(() => s.msg({ type: 'subscribe', channel: 'quebrado' })).not.toThrow();
    expect(s.sent.at(-1)).toMatchObject({ type: 'error', channel: 'quebrado' });
    s.msg({ type: 'run:input', runId: 'x', data: 'a' });
    expect(s.sent.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('run:input') });
    hub.onCommand('run:input', () => 'não está rodando');
    s.msg({ type: 'run:input', runId: 'x', data: 'a' });
    expect(s.sent.at(-1)).toEqual({ type: 'error', message: 'não está rodando' });
  });

  it('resolve canais dinâmicos', () => {
    const hub = new WsHub();
    const { state, producer } = manualProducer();
    hub.resolve((name) => (name.startsWith('run:') ? producer : undefined));
    const s = new FakeSocket();
    hub.attach(s);
    s.msg({ type: 'subscribe', channel: 'run:42' });
    expect(state.starts).toBe(1);
  });

  it('polled coleta imediatamente e em intervalo', async () => {
    vi.useFakeTimers();
    let n = 0;
    const emitted: unknown[] = [];
    const stop = polled(() => ++n, 1000).start((d) => emitted.push(d));
    await vi.advanceTimersByTimeAsync(0);
    expect(emitted).toEqual([1]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(emitted).toEqual([1, 2, 3]);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(emitted).toEqual([1, 2, 3]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { WsClient } from './ws';

class FakeSocket {
  readyState = 0;
  sent: unknown[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const client = new WsClient('ws://x/ws', () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  });
  return { client, sockets };
}

describe('WsClient', () => {
  it('assina ao abrir e entrega snapshots ao listener', () => {
    const { client, sockets } = setup();
    const listener = vi.fn();
    client.subscribe('health', listener);
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual([{ type: 'subscribe', channel: 'health' }]);
    sockets[0]!.receive({ type: 'snapshot', channel: 'health', data: { ok: true } });
    sockets[0]!.receive({ type: 'snapshot', channel: 'outro', data: 1 });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ ok: true });
  });

  it('só cancela a assinatura quando sai o último listener', () => {
    const { client, sockets } = setup();
    const off1 = client.subscribe('health', () => {});
    const off2 = client.subscribe('health', () => {});
    sockets[0]!.open();
    off1();
    expect(sockets[0]!.sent).toEqual([{ type: 'subscribe', channel: 'health' }]);
    off2();
    expect(sockets[0]!.sent).toContainEqual({ type: 'unsubscribe', channel: 'health' });
  });

  it('reconecta e reassina', () => {
    vi.useFakeTimers();
    const { client, sockets } = setup();
    const statuses: string[] = [];
    client.onStatus((s) => statuses.push(s));
    client.subscribe('health', () => {});
    sockets[0]!.open();
    sockets[0]!.close();
    vi.advanceTimersByTime(600);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(sockets[1]!.sent).toEqual([{ type: 'subscribe', channel: 'health' }]);
    expect(statuses).toEqual(['closed', 'connecting', 'open', 'closed', 'connecting', 'open']);
    client.close();
    vi.useRealTimers();
  });
});

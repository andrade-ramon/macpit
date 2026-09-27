import type { PortEntry } from '@macpit/shared';
import { describe, expect, it } from 'vitest';
import { describeBindings, filterPorts, portUrl } from './portFilters';

const e = (port: number, extra: Partial<PortEntry> = {}): PortEntry => ({
  protocol: 'TCP',
  port,
  pid: port * 10,
  command: 'node',
  user: 'alice',
  uid: 501,
  bindings: [{ address: '127.0.0.1', family: 'IPv4' }],
  scope: 'local',
  ...extra,
});

const LIST = [
  e(3000, { commandLine: 'node server.js' }),
  e(5432, { command: 'postgres' }),
  e(5353, { protocol: 'UDP', scope: 'network', user: '_mdnsresponder' }),
  e(80, { scope: 'network', user: 'root' }),
];
const all = { query: '', protocol: 'all', scope: 'all' } as const;

describe('filterPorts', () => {
  it('por prefixo de porta ou PID exato', () => {
    expect(filterPorts(LIST, { ...all, query: '53' }).map((x) => x.port)).toEqual([5353]);
    expect(filterPorts(LIST, { ...all, query: '54320' }).map((x) => x.port)).toEqual([5432]);
  });

  it('por texto', () => {
    expect(filterPorts(LIST, { ...all, query: 'server.js' }).map((x) => x.port)).toEqual([3000]);
    expect(filterPorts(LIST, { ...all, query: 'ROOT' }).map((x) => x.port)).toEqual([80]);
  });

  it('por protocolo e escopo', () => {
    expect(filterPorts(LIST, { ...all, protocol: 'UDP' })).toHaveLength(1);
    expect(filterPorts(LIST, { ...all, scope: 'network' }).map((x) => x.port)).toEqual([5353, 80]);
  });
});

describe('describeBindings', () => {
  it('resume endereços', () => {
    expect(
      describeBindings([
        { address: '*', family: 'IPv4' },
        { address: '*', family: 'IPv6' },
      ]),
    ).toBe('todas as interfaces');
    expect(
      describeBindings([
        { address: '127.0.0.1', family: 'IPv4' },
        { address: '::1', family: 'IPv6' },
      ]),
    ).toBe('127.0.0.1, [::1]');
  });
});

describe('portUrl', () => {
  it('só para TCP', () => {
    expect(portUrl(LIST[0]!)).toBe('http://localhost:3000');
    expect(portUrl(LIST[2]!)).toBeUndefined();
  });
});

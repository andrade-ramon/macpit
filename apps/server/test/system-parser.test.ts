import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeMemory, cpuUsage, parseSwapUsage, parseVmStat, sumCpuTimes } from '../src/modules/system/parser.js';

const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/vm_stat.txt'), 'utf8');
const GiB = 1024 ** 3;

describe('parseVmStat', () => {
  it('lê page size e contadores (incluindo chaves entre aspas)', () => {
    const vm = parseVmStat(fixture);
    expect(vm.pageSize).toBe(16384);
    expect(vm.pages['pages free']).toBeGreaterThan(0);
    expect(vm.pages['anonymous pages']).toBeGreaterThan(0);
    expect(vm.pages['pages occupied by compressor']).toBeGreaterThan(0);
    expect(vm.pages['translation faults']).toBeGreaterThan(0);
  });

  it('falha sem page size', () => {
    expect(() => parseVmStat('Pages free: 10.')).toThrow();
  });
});

describe('computeMemory', () => {
  it('calcula como o Monitor de Atividade', () => {
    const vm = {
      pageSize: 4096,
      pages: {
        'anonymous pages': 1000,
        'pages purgeable': 100,
        'pages wired down': 200,
        'pages occupied by compressor': 300,
        'file-backed pages': 400,
      },
    };
    const m = computeMemory(vm, 4096 * 4000);
    expect(m.appBytes).toBe(900 * 4096);
    expect(m.usedBytes).toBe(1400 * 4096);
    expect(m.cachedBytes).toBe(500 * 4096);
    expect(m.freeBytes).toBe(2600 * 4096);
    expect(m.usedPct).toBe(35);
  });

  it('resultado coerente com a fixture real (16 GiB)', () => {
    const m = computeMemory(parseVmStat(fixture), 16 * GiB);
    expect(m.usedBytes).toBeGreaterThan(0);
    expect(m.usedBytes).toBeLessThanOrEqual(16 * GiB);
    expect(m.usedPct).toBeGreaterThan(0);
    expect(m.usedPct).toBeLessThanOrEqual(100);
  });
});

describe('parseSwapUsage', () => {
  it('lê formato C', () => {
    expect(parseSwapUsage('total = 2048.00M  used = 1024.50M  free = 1023.50M  (encrypted)')).toEqual({
      totalBytes: 2048 * 1024 ** 2,
      usedBytes: 1024.5 * 1024 ** 2,
    });
  });

  it('aceita vírgula decimal (locale pt-BR)', () => {
    expect(parseSwapUsage('total = 5120,00M  used = 3836,06M  free = 1283,94M  (encrypted)').totalBytes).toBe(
      5120 * 1024 ** 2,
    );
  });

  it('swap zerado', () => {
    expect(parseSwapUsage('total = 0.00M  used = 0.00M  free = 0.00M')).toEqual({ totalBytes: 0, usedBytes: 0 });
  });

  it('rejeita formato inesperado', () => {
    expect(() => parseSwapUsage('lixo')).toThrow();
  });
});

describe('cpuUsage', () => {
  const t = (user: number, sys: number, idle: number) => ({ user, nice: 0, sys, idle, irq: 0 });

  it('calcula deltas', () => {
    expect(cpuUsage(t(100, 50, 850), t(200, 100, 1050))).toEqual({ usagePct: 42.9, userPct: 28.6, systemPct: 14.3 });
  });

  it('retorna zero sem delta', () => {
    expect(cpuUsage(t(1, 1, 1), t(1, 1, 1))).toEqual({ usagePct: 0, userPct: 0, systemPct: 0 });
  });

  it('soma núcleos', () => {
    expect(sumCpuTimes([{ times: t(1, 2, 3) }, { times: t(10, 20, 30) }])).toEqual(t(11, 22, 33));
  });
});

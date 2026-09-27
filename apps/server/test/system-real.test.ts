import { describe, expect, it } from 'vitest';
import { SystemService } from '../src/modules/system/service.js';

// Integração com os comandos reais do macOS.
describe.runIf(process.platform === 'darwin')('SystemService (macOS real)', () => {
  it('coleta métricas do sistema', async () => {
    const s = await new SystemService().sample();
    expect(s.memory.totalBytes).toBeGreaterThan(0);
    expect(s.memory.usedPct).toBeGreaterThan(0);
    expect(s.swap.totalBytes).toBeGreaterThanOrEqual(0);
    expect(s.cpu.cores).toBeGreaterThan(0);
  });
});

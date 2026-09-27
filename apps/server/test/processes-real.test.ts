import { describe, expect, it } from 'vitest';
import { ProcessService } from '../src/modules/processes/service.js';

describe.runIf(process.platform === 'darwin')('ProcessService (macOS real)', () => {
  it('lista processos reais, incluindo o próprio', async () => {
    const svc = new ProcessService();
    const { processes } = await svc.list();
    expect(processes.length).toBeGreaterThan(10);
    const me = processes.find((p) => p.pid === process.pid);
    expect(me).toBeDefined();
    expect(me!.command).toContain('node');
  });

  it('lsof do próprio processo', async () => {
    const files = await new ProcessService().openFiles(process.pid);
    expect(files.some((f) => f.kind === 'cwd')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { ExecError, run } from '../src/lib/exec.js';

describe('run', () => {
  it('executa sem shell (metacaracteres são literais)', async () => {
    const { stdout } = await run('/bin/echo', ['a; echo INJECTED', '$(whoami)']);
    expect(stdout.trim()).toBe('a; echo INJECTED $(whoami)');
  });

  it('rejeita exit code diferente de zero', async () => {
    await expect(run('/bin/sh', ['-c', 'exit 3'])).rejects.toMatchObject({ name: 'ExecError', exitCode: 3 });
  });

  it('aceita exit codes permitidos', async () => {
    const r = await run('/bin/sh', ['-c', 'exit 1'], { okExitCodes: [0, 1] });
    expect(r.exitCode).toBe(1);
  });

  it('respeita timeout', async () => {
    const err = await run('/bin/sleep', ['5'], { timeoutMs: 100 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExecError);
    expect((err as ExecError).timedOut).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';

const calls: Array<{ file: string; args: readonly string[] }> = [];
vi.mock('../src/lib/exec.js', () => ({
  run: async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    return { stdout: '', stderr: '', exitCode: 0 };
  },
}));

const { osascriptNotify } = await import('../src/modules/notify/notifier.js');

describe('osascriptNotify', () => {
  it('passa título e mensagem como argv (sem interpolar no AppleScript)', async () => {
    const evil = 'x" & (do shell script "id") & "';
    await osascriptNotify('macpit', evil);
    const { file, args } = calls[0]!;
    expect(file).toBe('/usr/bin/osascript');
    const script = args.filter((_, i) => args[i - 1] === '-e');
    expect(script.join('\n')).not.toContain(evil);
    expect(args.slice(args.indexOf('--') + 1)).toEqual(['macpit', evil]);
  });
});

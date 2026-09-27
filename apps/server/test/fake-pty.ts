import type { PtyLike, RunDeps, SpawnOptions } from '../src/modules/runs/manager.js';

export class FakePty implements PtyLike {
  static nextPid = 5000;
  readonly pid = FakePty.nextPid++;
  written: string[] = [];
  size: [number, number];
  private dataCb?: (d: string) => void;
  private exitCb?: (e: { exitCode: number; signal?: number }) => void;

  constructor(
    readonly file: string,
    readonly args: string[],
    readonly opts: SpawnOptions,
  ) {
    this.size = [opts.cols, opts.rows];
  }
  onData(cb: (d: string) => void) {
    this.dataCb = cb;
  }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void) {
    this.exitCb = cb;
  }
  write(d: string) {
    this.written.push(d);
  }
  resize(c: number, r: number) {
    this.size = [c, r];
  }
  kill() {}
  emit(d: string) {
    this.dataCb?.(d);
  }
  exit(exitCode: number, signal?: number) {
    this.exitCb?.({ exitCode, ...(signal ? { signal } : {}) });
  }
}

export function fakeRunDeps(home: string) {
  const ptys: FakePty[] = [];
  const kills: Array<[number, string]> = [];
  /** PIDs que "ignoram" SIGTERM (continuam vivos até SIGKILL). */
  const stubborn = new Set<number>();
  const dead = new Set<number>();
  const deps: RunDeps = {
    spawn: (file, args, opts) => {
      const p = new FakePty(file, args, opts);
      ptys.push(p);
      return p;
    },
    killGroup: (pid, sig) => {
      kills.push([pid, sig]);
      if (sig === 'SIGKILL' || !stubborn.has(pid)) dead.add(pid);
    },
    isAlive: (pid) => ptys.some((p) => p.pid === pid) && !dead.has(pid),
    now: () => Date.now(),
    home: () => home,
  };
  return { deps, ptys, kills, stubborn, dead };
}

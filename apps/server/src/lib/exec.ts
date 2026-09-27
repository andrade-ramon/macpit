import { execFile } from 'node:child_process';

export interface ExecOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Códigos de saída considerados sucesso (ex.: `lsof` retorna 1 quando não encontra nada). */
  okExitCodes?: readonly number[];
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ExecError extends Error {
  constructor(
    message: string,
    readonly file: string,
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly stderr: string,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = 'ExecError';
  }
}

/**
 * Executa um binário SEM shell, com argumentos em array. Usado por todos os coletores.
 * Nunca interpole input do usuário em string de shell — ver AGENTS.md, regra 3.
 */
export function run(file: string, args: readonly string[] = [], opts: ExecOptions = {}): Promise<ExecResult> {
  const { timeoutMs = 10_000, maxBuffer = 32 * 1024 * 1024, cwd, env, okExitCodes = [0] } = opts;
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer, cwd, env, encoding: 'utf8', shell: false, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve({ stdout, stderr, exitCode: 0 });
        const err = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean; signal?: string };
        const exitCode = typeof err.code === 'number' ? err.code : null;
        if (exitCode !== null && okExitCodes.includes(exitCode)) return resolve({ stdout, stderr, exitCode });
        const timedOut = err.killed === true && err.signal === 'SIGTERM';
        const reason = timedOut ? `timeout após ${timeoutMs}ms` : (exitCode ?? err.code ?? err.message);
        reject(new ExecError(`${file} falhou: ${String(reason)}`, file, args, exitCode, stderr, timedOut));
      },
    );
  });
}

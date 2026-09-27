import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import type { TailChunk, TailCreated } from '@macpit/shared';
import { tailChannel } from '@macpit/shared';
import type { Audit } from '../../lib/audit.js';
import { noopAudit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http.js';
import type { ChannelProducer } from '../../ws/hub.js';

export interface TailOptions {
  /** Quanto do fim do arquivo mandar ao iniciar. */
  initialBytes: number;
  /** Intervalo de verificação do tamanho (fs.watchFile). */
  pollMs: number;
  /** Se ninguém assinar em até `idleTtlMs`, o tail é descartado. */
  idleTtlMs: number;
  /** Crescimento maior que isso num único ciclo → envia só o final com `reset`. */
  maxChunkBytes: number;
}

const DEFAULTS: TailOptions = { initialBytes: 64 * 1024, pollMs: 500, idleTtlMs: 60_000, maxChunkBytes: 1024 * 1024 };

/** Verifica se `path` é um arquivo regular aberto pelo `pid` (a única forma de criar um tail). */
export type OpenFileCheck = (pid: number, path: string) => Promise<boolean>;

interface TailEntry {
  path: string;
  pid: number;
  expiry: NodeJS.Timeout | undefined;
}

/**
 * Tails ao vivo de arquivos abertos por processos.
 * Fluxo: `create(pid, path)` → cliente assina `tail:<id>` → ao sair o último inscrito o tail é destruído.
 */
export class TailService {
  private readonly tails = new Map<string, TailEntry>();
  private readonly opts: TailOptions;

  constructor(
    private readonly isOpenBy: OpenFileCheck,
    private readonly audit: Audit = noopAudit,
    opts: Partial<TailOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  async create(pid: number, path: string): Promise<TailCreated> {
    if (!(await this.isOpenBy(pid, path))) {
      throw new HttpError(400, 'o arquivo não é um arquivo regular aberto por esse processo', 'not_open');
    }
    const stat = await fs.promises.stat(path).catch(() => undefined);
    if (!stat?.isFile()) throw new HttpError(400, 'arquivo inexistente ou não regular', 'not_file');
    try {
      await fs.promises.access(path, fs.constants.R_OK);
    } catch {
      throw new HttpError(403, 'sem permissão de leitura no arquivo', 'eacces');
    }

    const id = randomBytes(8).toString('hex');
    const entry: TailEntry = { path, pid, expiry: undefined };
    entry.expiry = setTimeout(() => this.tails.delete(id), this.opts.idleTtlMs);
    entry.expiry.unref();
    this.tails.set(id, entry);
    this.audit('tail', path, { pid });
    return { id, channel: tailChannel(id), path };
  }

  has(id: string): boolean {
    return this.tails.has(id);
  }

  /** Resolvedor para o hub: `tail:<id>`. */
  resolver = (name: string): ChannelProducer | undefined => {
    if (!name.startsWith('tail:')) return undefined;
    const id = name.slice(5);
    const entry = this.tails.get(id);
    if (!entry) return undefined;
    clearTimeout(entry.expiry);
    return {
      start: (emit) => {
        const stop = followFile(entry.path, this.opts, emit);
        return () => {
          stop();
          this.tails.delete(id);
        };
      },
    };
  };

  close(): void {
    for (const t of this.tails.values()) clearTimeout(t.expiry);
    this.tails.clear();
  }
}

/** Acompanha um arquivo por polling de tamanho; lida com crescimento, truncamento e rotação. */
export function followFile(path: string, opts: TailOptions, emit: (chunk: TailChunk) => void): () => void {
  let offset = 0;
  let ino = -1;
  let decoder = new StringDecoder('utf8');
  let queue = Promise.resolve();
  let stopped = false;

  const readRange = async (start: number, end: number): Promise<string> => {
    if (end <= start) return '';
    const fh = await fs.promises.open(path, 'r');
    try {
      const buf = Buffer.alloc(end - start);
      const { bytesRead } = await fh.read(buf, 0, buf.length, start);
      return decoder.write(buf.subarray(0, bytesRead));
    } finally {
      await fh.close();
    }
  };

  /** Lê o final do arquivo começando numa quebra de linha. */
  const readTail = async (size: number, bytes: number): Promise<string> => {
    const start = Math.max(0, size - bytes);
    decoder = new StringDecoder('utf8');
    const text = await readRange(start, size);
    offset = size;
    if (start === 0) return text;
    const nl = text.indexOf('\n');
    return nl === -1 ? text : text.slice(nl + 1);
  };

  const check = () => {
    queue = queue
      .then(async () => {
        if (stopped) return;
        const st = await fs.promises.stat(path).catch(() => undefined);
        if (!st) return;
        if (ino === -1) {
          ino = st.ino;
          emit({ chunk: await readTail(st.size, opts.initialBytes), reset: true });
          return;
        }
        const rotated = st.ino !== ino;
        if (rotated || st.size < offset) {
          ino = st.ino;
          offset = 0;
          decoder = new StringDecoder('utf8');
          emit({ chunk: await readTail(st.size, opts.initialBytes), reset: true, truncated: true });
          return;
        }
        if (st.size - offset > opts.maxChunkBytes) {
          emit({ chunk: await readTail(st.size, opts.initialBytes), reset: true });
          return;
        }
        if (st.size > offset) {
          const text = await readRange(offset, st.size);
          offset = st.size;
          if (text && !stopped) emit({ chunk: text, reset: false });
        }
      })
      .catch(() => {});
  };

  check();
  const timer = setInterval(check, opts.pollMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

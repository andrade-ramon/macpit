import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** O servidor NUNCA escuta em outra interface. Ver docs/05-seguranca.md. */
export const HOST = '127.0.0.1';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const EnvSchema = z.object({
  MACPIT_PORT: z.coerce.number().int().min(0).max(65535).default(7777),
  MACPIT_DATA_DIR: z.string().optional(),
  MACPIT_SHELL: z.string().default('/bin/bash'),
  MACPIT_SAMPLE_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
  MACPIT_DISK_SAMPLE_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  MACPIT_WEB_DEV_URL: z.url().optional(),
  MACPIT_WEB_DIST: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export interface Config {
  host: typeof HOST;
  port: number;
  dataDir: string;
  shell: string;
  sampleIntervalMs: number;
  /** Intervalo de gravação do histórico de disco no SQLite. */
  diskSampleIntervalMs: number;
  /** Origem do Vite em desenvolvimento (ex.: http://localhost:5173), se houver. */
  webDevUrl: string | undefined;
  webDist: string;
  env: 'development' | 'production' | 'test';
  serverRoot: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Variáveis vazias (ex.: `MACPIT_DATA_DIR=` no .env) contam como ausentes.
  const cleaned: Record<string, string> = Object.fromEntries(
    Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ''),
  );
  // Nome antigo do projeto (bash-monitor): BM_X continua valendo quando MACPIT_X não foi definido.
  for (const [k, v] of Object.entries(cleaned)) {
    if (k.startsWith('BM_') && cleaned[`MACPIT_${k.slice(3)}`] === undefined) cleaned[`MACPIT_${k.slice(3)}`] = v;
  }
  const parsed = EnvSchema.parse(cleaned);
  return {
    host: HOST,
    port: parsed.MACPIT_PORT,
    dataDir: path.resolve(parsed.MACPIT_DATA_DIR ?? path.join(os.homedir(), '.macpit')),
    shell: parsed.MACPIT_SHELL,
    sampleIntervalMs: parsed.MACPIT_SAMPLE_INTERVAL_MS,
    diskSampleIntervalMs: parsed.MACPIT_DISK_SAMPLE_INTERVAL_MS,
    webDevUrl: parsed.MACPIT_WEB_DEV_URL?.replace(/\/$/, ''),
    webDist: path.resolve(parsed.MACPIT_WEB_DIST ?? path.join(serverRoot, '../web/dist')),
    env: parsed.NODE_ENV,
    serverRoot,
  };
}

/**
 * Renomeação bash-monitor → macpit: move `~/.bash-monitor` para `~/.macpit` (uma vez) e deixa um
 * link simbólico no lugar antigo, porque o histórico de execuções guarda o caminho absoluto dos logs.
 * Só age no diretório padrão; retorna o que fez, para o boot avisar.
 */
export function migrateLegacyDataDir(dataDir: string, home = os.homedir()): 'moved' | undefined {
  const legacy = path.join(home, '.bash-monitor');
  if (dataDir !== path.join(home, '.macpit') || fs.existsSync(dataDir)) return undefined;
  let st: fs.Stats;
  try {
    st = fs.lstatSync(legacy);
  } catch {
    return undefined;
  }
  if (!st.isDirectory()) return undefined;
  fs.renameSync(legacy, dataDir);
  fs.symlinkSync(dataDir, legacy);
  return 'moved';
}

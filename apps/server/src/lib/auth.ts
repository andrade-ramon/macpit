import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_FILE = 'token';

/** Garante o diretório de dados com permissão 0700. */
export function ensureDataDir(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dataDir, 0o700);
}

/** Lê o token de `<dataDir>/token` ou cria um novo (256 bits, arquivo 0600). */
export function loadOrCreateToken(dataDir: string): string {
  ensureDataDir(dataDir);
  const file = path.join(dataDir, TOKEN_FILE);
  if (fs.existsSync(file)) {
    const token = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{64}$/.test(token)) {
      fs.chmodSync(file, 0o600);
      return token;
    }
  }
  const token = randomBytes(32).toString('hex');
  fs.writeFileSync(file, token + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return token;
}

export function tokensMatch(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

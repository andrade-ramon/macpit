import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AiCredentials } from '../src/modules/ai/credentials.js';
import { AI_KEY } from './fixtures/ai.js';

const directories: string[] = [];
const create = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'macpit-ai-key-'));
  directories.push(directory);
  return directory;
};
afterEach(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('credenciais de IA', () => {
  it('persiste 0600, relê, rotaciona atomicamente e remove', () => {
    const dir = create();
    const credentials = new AiCredentials(dir);
    expect(credentials.get()).toBeUndefined();
    credentials.set({ provider: 'gemini', apiKey: AI_KEY, storage: 'disk' });
    expect(fs.statSync(path.join(dir, 'ai-credential.json')).mode & 0o777).toBe(0o600);
    expect(new AiCredentials(dir).get()?.apiKey).toBe(AI_KEY);
    credentials.set({ provider: 'gemini', apiKey: 'chave-rotacionada-sintetica', storage: 'disk' });
    expect(new AiCredentials(dir).get()?.apiKey).toBe('chave-rotacionada-sintetica');
    expect(fs.readdirSync(dir)).toEqual(['ai-credential.json']);
    credentials.remove();
    expect(new AiCredentials(dir).get()).toBeUndefined();
  });
  it('sessão substitui arquivo persistente e não sobrevive ao fechamento', () => {
    const dir = create();
    const credentials = new AiCredentials(dir);
    credentials.set({ provider: 'gemini', apiKey: AI_KEY, storage: 'disk' });
    credentials.set({ provider: 'gemini', apiKey: AI_KEY, storage: 'session' });
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(credentials.get()?.apiKey).toBe(AI_KEY);
    expect(new AiCredentials(dir).get()).toBeUndefined();
    credentials.close();
    expect(credentials.get()).toBeUndefined();
  });
  it('recusa arquivo permissivo e arquivo inválido sem revelar dados', () => {
    const dir = create();
    const file = path.join(dir, 'ai-credential.json');
    fs.writeFileSync(file, AI_KEY, { mode: 0o644 });
    const credentials = new AiCredentials(dir);
    expect(() => credentials.get()).toThrow('0600');
    fs.chmodSync(file, 0o600);
    try {
      credentials.get();
    } catch (error) {
      expect(String(error)).not.toContain(AI_KEY);
    }
  });
  it('não segue link simbólico nem aceita hardlink; remoção não toca no destino', () => {
    const dir = create();
    const other = path.join(create(), 'destino');
    fs.writeFileSync(other, AI_KEY, { mode: 0o600 });
    const file = path.join(dir, 'ai-credential.json');
    fs.symlinkSync(other, file);
    const credentials = new AiCredentials(dir);
    expect(() => credentials.get()).toThrow('sem links');
    credentials.remove();
    expect(fs.readFileSync(other, 'utf8')).toBe(AI_KEY);
    fs.linkSync(other, file);
    expect(() => credentials.get()).toThrow('sem links');
  });
  it('recusa diretório permissivo ou simbólico sem gravar chave', () => {
    const dir = create();
    fs.chmodSync(dir, 0o755);
    const key = { provider: 'gemini', apiKey: AI_KEY, storage: 'disk' } as const;
    expect(() => new AiCredentials(dir).set(key)).toThrow('0700');
    expect(fs.readdirSync(dir)).toEqual([]);
    const link = path.join(create(), 'link');
    fs.symlinkSync(dir, link);
    expect(() => new AiCredentials(link).set(key)).toThrow('sem links');
  });
});

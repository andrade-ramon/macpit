import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadOrCreateToken, tokensMatch } from '../src/lib/auth.js';

describe('loadOrCreateToken', () => {
  it('cria token com permissões restritas e reutiliza', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-auth-')), 'data');
    const t1 = loadOrCreateToken(dir);
    expect(t1).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, 'token')).mode & 0o777).toBe(0o600);
    expect(loadOrCreateToken(dir)).toBe(t1);
  });

  it('regenera token corrompido', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-auth-'));
    fs.writeFileSync(path.join(dir, 'token'), 'lixo');
    expect(loadOrCreateToken(dir)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('tokensMatch', () => {
  it('compara com segurança', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'ab')).toBe(false);
    expect(tokensMatch('abc', undefined)).toBe(false);
  });
});

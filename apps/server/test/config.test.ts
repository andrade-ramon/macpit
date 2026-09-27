import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';

describe('loadConfig', () => {
  it('usa padrões e sempre 127.0.0.1', () => {
    const c = loadConfig({ HOME: '/Users/x' });
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(7777);
    expect(c.shell).toBe('/bin/bash');
    expect(c.env).toBe('production');
  });

  it('ignora variáveis vazias', () => {
    const c = loadConfig({ MACPIT_DATA_DIR: '', MACPIT_PORT: '8080' });
    expect(c.dataDir).toMatch(/\.macpit$/);
    expect(c.port).toBe(8080);
  });

  it('rejeita porta inválida', () => {
    expect(() => loadConfig({ MACPIT_PORT: '99999' })).toThrow();
  });

  it('normaliza MACPIT_WEB_DEV_URL', () => {
    expect(loadConfig({ MACPIT_WEB_DEV_URL: 'http://localhost:5173/' }).webDevUrl).toBe('http://localhost:5173');
  });
});

describe('renomeação bash-monitor → macpit', () => {
  it('BM_* vale quando MACPIT_* não foi definido', async () => {
    const { loadConfig } = await import('../src/config/index.js');
    expect(loadConfig({ BM_PORT: '8888' }).port).toBe(8888);
    expect(loadConfig({ BM_PORT: '8888', MACPIT_PORT: '9999' }).port).toBe(9999);
  });

  it('move ~/.bash-monitor para ~/.macpit uma vez e deixa um link', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { migrateLegacyDataDir } = await import('../src/config/index.js');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-home-'));
    const target = path.join(home, '.macpit');
    expect(migrateLegacyDataDir(target, home)).toBeUndefined(); // nada para migrar
    fs.mkdirSync(path.join(home, '.bash-monitor', 'runs'), { recursive: true });
    fs.writeFileSync(path.join(home, '.bash-monitor', 'token'), 't');
    fs.writeFileSync(path.join(home, '.bash-monitor', 'runs', 'r1.log'), 'log');
    expect(migrateLegacyDataDir(path.join(home, 'outro'), home)).toBeUndefined(); // diretório customizado
    expect(migrateLegacyDataDir(target, home)).toBe('moved');
    expect(fs.readFileSync(path.join(target, 'token'), 'utf8')).toBe('t');
    // caminhos antigos gravados no histórico continuam abrindo
    expect(fs.readFileSync(path.join(home, '.bash-monitor', 'runs', 'r1.log'), 'utf8')).toBe('log');
    expect(fs.lstatSync(path.join(home, '.bash-monitor')).isSymbolicLink()).toBe(true);
    expect(migrateLegacyDataDir(target, home)).toBeUndefined(); // idempotente
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { HOST, TOKEN, testConfig } from './helpers.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

describe('static SPA', () => {
  it('PWA: manifest, service worker e ícones com tipos e cache corretos, sem autenticação', async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<div id="root"></div>');
    fs.writeFileSync(path.join(dist, 'sw.js'), 'self.addEventListener("fetch",()=>{})');
    fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), '{"name":"macpit"}');
    fs.mkdirSync(path.join(dist, 'icons'));
    fs.writeFileSync(path.join(dist, 'icons', 'icon-192.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { app } = await buildApp(testConfig({ MACPIT_WEB_DIST: dist }), TOKEN);
    close = () => app.close();

    const sw = await app.inject({ url: '/sw.js', headers: HOST });
    expect(sw.statusCode).toBe(200);
    expect(sw.headers['content-type']).toMatch(/javascript/);
    expect(sw.headers['cache-control']).toBe('no-cache');

    const manifest = await app.inject({ url: '/manifest.webmanifest', headers: HOST });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers['content-type']).toMatch(/application\/manifest\+json/);
    expect(manifest.headers['cache-control']).toBe('no-cache');

    const icon = await app.inject({ url: '/icons/icon-192.png', headers: HOST });
    expect(icon.headers['content-type']).toBe('image/png');
    expect((await app.inject({ url: '/icons/nao-existe.png', headers: HOST })).statusCode).toBe(404);
  });

  it('serve index.html para rotas do front sem autenticação', async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<div id="root"></div>');
    fs.writeFileSync(path.join(dist, 'app.js'), 'console.log(1)');
    const { app } = await buildApp(testConfig({ MACPIT_WEB_DIST: dist }), TOKEN);
    close = () => app.close();

    const page = await app.inject({ url: '/processes', headers: HOST });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('id="root"');

    const asset = await app.inject({ url: '/app.js', headers: HOST });
    expect(asset.statusCode).toBe(200);

    const api = await app.inject({ url: '/api/xyz', headers: { ...HOST, cookie: `macpit_session=${TOKEN}` } });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'não encontrado' });

    // rota do front com query string e aninhada
    expect((await app.inject({ url: '/actions?run=abc', headers: HOST })).body).toContain('id="root"');
  });

  it('asset criado depois do boot é servido; asset inexistente dá 404 (não index.html)', async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<div id="root"></div>');
    const { app } = await buildApp(testConfig({ MACPIT_WEB_DIST: dist }), TOKEN);
    close = () => app.close();

    // simula um `pnpm build` com o servidor rodando
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'assets', 'Page-NEW.js'), 'export default 1');
    const fresh = await app.inject({ url: '/assets/Page-NEW.js', headers: HOST });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.headers['content-type']).toMatch(/javascript/);

    const missing = await app.inject({ url: '/assets/Page-OLD.js', headers: HOST });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toContain('id="root"');
  });
});

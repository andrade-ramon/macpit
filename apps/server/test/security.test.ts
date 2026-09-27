import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

async function setup(overrides?: Record<string, string>) {
  const { app } = await buildApp(testConfig(overrides), TOKEN);
  close = () => app.close();
  return app;
}

describe('segurança HTTP', () => {
  it('bloqueia /api sem autenticação', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/api/health', headers: HOST });
    expect(res.statusCode).toBe(401);
  });

  it('aceita cookie de sessão', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/api/health', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, isRoot: expect.any(Boolean), sampleIntervalMs: 250 });
  });

  it('aceita o cookie antigo (bm_session) e renova com o nome novo', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/api/health', headers: { ...HOST, cookie: `bm_session=${TOKEN}` } });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['set-cookie'])).toContain('macpit_session=');
    const wrong = await app.inject({ url: '/api/health', headers: { ...HOST, cookie: 'bm_session=errado' } });
    expect(wrong.statusCode).toBe(401);
  });

  it('aceita Bearer token', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/api/health', headers: { ...HOST, authorization: `Bearer ${TOKEN}` } });
    expect(res.statusCode).toBe(200);
  });

  it('rejeita Host desconhecido (DNS rebinding)', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/api/health', headers: { ...AUTH, host: 'evil.com:7777' } });
    expect(res.statusCode).toBe(421);
  });

  it('rejeita Origin desconhecida', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/api/health', headers: { ...AUTH, origin: 'https://evil.com' } });
    expect(res.statusCode).toBe(403);
  });

  it('bloqueia POST cross-site', async () => {
    const app = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/health',
      headers: { ...AUTH, 'sec-fetch-site': 'cross-site' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('aceita origem do Vite em dev', async () => {
    const app = await setup({ MACPIT_WEB_DEV_URL: 'http://localhost:5173' });
    const res = await app.inject({ url: '/api/health', headers: { ...AUTH, origin: 'http://localhost:5173' } });
    expect(res.statusCode).toBe(200);
  });

  it('/auth com token válido define cookie httpOnly e redireciona', async () => {
    const app = await setup();
    const res = await app.inject({ url: `/auth?token=${TOKEN}`, headers: HOST });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain(`macpit_session=${TOKEN}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('/auth com token inválido retorna 401', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/auth?token=errado', headers: HOST });
    expect(res.statusCode).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /auth (token colado na tela de acesso) define o cookie; inválido ou cross-site é recusado', async () => {
    const app = await setup();
    const post = (payload: object, extra: Record<string, string> = {}) =>
      app.inject({ method: 'POST', url: '/auth', headers: { ...HOST, ...extra }, payload });
    const ok = await post({ token: `  ${TOKEN}\n` }, { origin: 'http://127.0.0.1:7777' });
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers['set-cookie'])).toMatch(/macpit_session=.*HttpOnly.*SameSite=Strict/);
    const bad = await post({ token: 'errado' });
    expect(bad.statusCode).toBe(401);
    expect(bad.headers['set-cookie']).toBeUndefined();
    expect((await post({})).statusCode).toBe(401);
    expect((await post({ token: TOKEN }, { origin: 'https://evil.com' })).statusCode).toBe(403);
  });

  it('sessão deslizante: /api/health com cookie renova o cookie; Bearer e outras rotas não', async () => {
    const app = await setup();
    const health = await app.inject({ url: '/api/health', headers: AUTH });
    expect(String(health.headers['set-cookie'])).toMatch(/macpit_session=.*Max-Age=2592000/);
    const bearer = await app.inject({ url: '/api/health', headers: { ...HOST, authorization: `Bearer ${TOKEN}` } });
    expect(bearer.headers['set-cookie']).toBeUndefined();
    const other = await app.inject({ url: '/api/system', headers: AUTH });
    expect(other.headers['set-cookie']).toBeUndefined();
    const unauth = await app.inject({ url: '/api/health', headers: { ...HOST, cookie: 'macpit_session=errado' } });
    expect(unauth.headers['set-cookie']).toBeUndefined();
  });

  it('rota desconhecida em /api retorna 404 JSON', async () => {
    const app = await setup();
    const res = await app.inject({ url: '/api/nada', headers: AUTH });
    expect(res.statusCode).toBe(404);
  });
});

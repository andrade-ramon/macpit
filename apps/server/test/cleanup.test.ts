import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CleanupService, type CleanupDeps } from '../src/modules/disk/cleanup.js';
import { buildApp } from '../src/app.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

let home: string;
let cache: string;
let uid: number;
let now: number;
const trash = vi.fn(async (file: string) => {
  await fs.rename(file, path.join(home, 'lixeira-falsa', path.basename(file)));
});
const inUse = vi.fn(async () => false);
const audit = vi.fn();
function service(overrides: CleanupDeps = {}) {
  return new CleanupService(path.join(home, 'dados'), audit, { home, uid, now: () => now, trash, inUse, ...overrides });
}
async function write(file: string, content = 'conteúdo sintético') {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}
beforeEach(async () => {
  home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'macpit-cleanup-test-')));
  uid = (await fs.stat(home)).uid;
  now = Date.now();
  cache = path.join(home, 'projetos', 'exemplo', 'node_modules', '.vite');
  await write(path.join(home, 'projetos', 'exemplo', 'package.json'), '{}');
  await write(path.join(cache, 'cache.js'));
  await fs.mkdir(path.join(home, 'lixeira-falsa'));
  trash.mockClear();
  inUse.mockClear();
  audit.mockClear();
});
afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe('limpeza assistida em arquivos temporários', () => {
  it('filtra caches e downloads antigos pelo tamanho mínimo inclusive na fronteira de 100 MB', async () => {
    const limit = 100_000_000;
    for (const [name, size] of [
      ['menor.js', limit - 1],
      ['igual.js', limit],
      ['maior.js', limit + 1],
    ] as const) {
      const file = path.join(cache, name);
      await write(file);
      await fs.truncate(file, size);
    }
    const old = path.join(home, 'Downloads/antigo.zip');
    await write(old);
    await fs.utimes(old, new Date(0), new Date(0));
    const cleanup = service();
    const plan = await cleanup.scan('~', undefined, 10_000, limit);
    expect(plan.files.map((file) => path.basename(file.path)).sort()).toEqual(['igual.js', 'maior.js']);
    const all = await cleanup.scan('~', undefined, 10_000, 0);
    expect(all.files.some((file) => file.path === old)).toBe(true);
    for (const minimum of [-1, 0.5, NaN, Infinity, 1_000_000_000_001])
      await expect(cleanup.scan('~', undefined, 10_000, minimum)).rejects.toMatchObject({ statusCode: 400 });
    expect(trash).not.toHaveBeenCalled();
  });
  it('respeita o limite escolhido e permite ampliá-lo numa nova análise', async () => {
    await write(path.join(cache, 'segundo.js'));
    await write(path.join(cache, 'terceiro.js'));
    const cleanup = service();
    const limited = await cleanup.scan('~', undefined, 1);
    expect(limited.files).toHaveLength(1);
    expect(limited.partial).toBe(true);
    const expanded = await cleanup.scan('~', undefined, 10);
    expect(expanded.files).toHaveLength(3);
    expect(expanded.partial).toBe(false);
    for (const limit of [0, 20_001, 1.5, NaN])
      await expect(cleanup.scan('~', undefined, limit)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('analisa caches reconhecidos e downloads antigos; protege fontes, segredos, bancos, links e backups', async () => {
    await write(path.join(home, 'projetos/exemplo/src/original.ts'));
    await write(path.join(cache, '.env'));
    await write(path.join(cache, 'credencial.pem'));
    await write(path.join(cache, 'dados.sqlite'));
    await write(path.join(cache, 'compartilhado.js'));
    await fs.chmod(path.join(cache, 'compartilhado.js'), 0o666);
    await write(path.join(cache, 'backups/copia.txt'));
    await fs.link(path.join(cache, 'cache.js'), path.join(cache, 'hardlink.js'));
    await write(path.join(cache, 'outro.js'));
    await fs.symlink(path.join(cache, 'outro.js'), path.join(cache, 'link.js'));
    await write(path.join(home, 'Downloads/antigo.zip'));
    await fs.utimes(path.join(home, 'Downloads/antigo.zip'), new Date(0), new Date(0));
    await write(path.join(home, 'Downloads/novo.txt'));
    const plan = await service().scan('~');
    expect(plan.files.map((file) => path.basename(file.path)).sort()).toEqual(['antigo.zip', 'outro.js']);
    expect(plan.files.find((file) => file.category === 'manual')?.impact).toContain('importante');
    expect(trash).not.toHaveBeenCalled();
  });
  it('não segue raiz ou ancestrais simbólicos, nem aceita caminhos livres fora do home', async () => {
    await fs.symlink(path.join(home, 'projetos'), path.join(home, 'atalho'));
    for (const root of ['/etc', '~/atalho/exemplo', '~/.ssh', 'projetos'])
      await expect(service().scan(root)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('não oferece limpeza quando o processo roda como root', async () => {
    await expect(service({ uid: 0 }).scan('~')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('envia somente a seleção à lixeira falsa, sem sobrescrever nem remover arquivos extras', async () => {
    await write(path.join(cache, 'preservar.js'));
    const cleanup = service();
    const plan = await cleanup.scan('~');
    const file = plan.files.find((f) => f.path.endsWith('/cache.js'))!;
    const result = await cleanup.execute(plan.id, [file.id]);
    expect(result.items[0]?.status).toBe('moved');
    expect(result.movedBytes).toBe(file.bytes);
    expect(await fs.readFile(path.join(cache, 'preservar.js'), 'utf8')).toBe('conteúdo sintético');
    expect(await fs.readdir(cache)).toEqual(['preservar.js']);
    expect(await fs.readFile(path.join(home, 'lixeira-falsa/cache.js'), 'utf8')).toBe('conteúdo sintético');
    await expect(cleanup.execute(plan.id, [file.id])).rejects.toMatchObject({ statusCode: 409 });
    expect(audit).toHaveBeenCalledWith('cleanup', plan.id, expect.objectContaining({ phase: 'finish', moved: 1 }));
  });
  it('recusa plano expirado, IDs desconhecidos e seleção duplicada', async () => {
    const cleanup = service();
    const plan = await cleanup.scan('~');
    await expect(cleanup.execute(plan.id, [randomUUID()])).rejects.toMatchObject({ statusCode: 400 });
    await expect(cleanup.execute(plan.id, [plan.files[0]!.id, plan.files[0]!.id])).rejects.toMatchObject({
      statusCode: 400,
    });
    now += 10 * 60_000;
    await expect(cleanup.execute(plan.id, [plan.files[0]!.id])).rejects.toMatchObject({ statusCode: 409 });
    expect(trash).not.toHaveBeenCalled();
  });
  it('ignora arquivo modificado, removido ou substituído por link depois da prévia', async () => {
    for (const mutation of ['changed', 'removed', 'link']) {
      const file = path.join(cache, 'cache.js');
      await write(file);
      const cleanup = service();
      const plan = await cleanup.scan('~');
      if (mutation === 'changed') await fs.writeFile(file, 'alterado');
      else {
        await fs.unlink(file);
        if (mutation === 'link') await fs.symlink(path.join(home, 'projetos/exemplo/package.json'), file);
      }
      const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
      expect(result.items[0]?.status).toBe('skipped');
      if (mutation === 'link') await fs.unlink(file);
    }
    expect(trash).not.toHaveBeenCalled();
  });
  it('recusa pasta ancestral substituída por link após a análise', async () => {
    const cleanup = service();
    const plan = await cleanup.scan('~');
    await fs.rename(cache, cache + '-original');
    await fs.symlink(cache + '-original', cache);
    const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
    expect(result.items[0]?.status).toBe('skipped');
    expect(trash).not.toHaveBeenCalled();
  });
  it('recusa limpeza se permissões de uma pasta forem abertas após a prévia', async () => {
    const cleanup = service();
    const plan = await cleanup.scan('~');
    await fs.chmod(cache, 0o777);
    const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
    expect(result.items[0]?.status).toBe('skipped');
    expect(trash).not.toHaveBeenCalled();
    const fresh = await cleanup.scan('~');
    expect(fresh.files).toHaveLength(0);
  });
  it('ignora arquivos em uso e falhas na consulta de uso', async () => {
    for (const check of [
      async () => true,
      async () => {
        throw new Error('Falha na conferência');
      },
    ]) {
      const cleanup = service({ inUse: check });
      const plan = await cleanup.scan('~');
      const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
      expect(result.items[0]?.status).toBe('skipped');
    }
    expect(trash).not.toHaveBeenCalled();
  });
  it('lsof real detecta um arquivo sintético aberto sem mover arquivos pessoais', async () => {
    const handle = await fs.open(path.join(cache, 'cache.js'), 'r');
    try {
      const cleanup = service({ inUse: undefined });
      const plan = await cleanup.scan('~');
      const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
      expect(result.items[0]?.status).toBe('skipped');
      expect(result.items[0]?.message).toContain('em uso');
      expect(trash).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });
  it('preserva o manifesto mesmo quando o arquivo tem o nome recuperacao.json', async () => {
    await fs.unlink(path.join(cache, 'cache.js'));
    await write(path.join(cache, 'recuperacao.json'), 'original');
    const cleanup = service();
    const plan = await cleanup.scan('~');
    const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
    expect(result.items[0]?.status).toBe('moved');
    expect(await fs.readFile(path.join(home, 'lixeira-falsa/recuperacao.json'), 'utf8')).toBe('original');
    expect(await fs.readdir(cache)).toEqual([]);
  });
  it('limite de tempo retorna prévia parcial e evita tratar análise incompleta como completa', async () => {
    let clock = now;
    const cleanup = service({
      now: () => {
        clock += 100_000;
        return clock;
      },
    });
    const plan = await cleanup.scan('~');
    expect(plan.partial).toBe(true);
    expect(plan.warnings.join(' ')).toContain('Limite');
    expect(trash).not.toHaveBeenCalled();
  });
  it('restaura após falha de Finder e remove apenas a área temporária vazia', async () => {
    const cleanup = service({
      trash: async () => {
        throw new Error('Finder recusou');
      },
    });
    const plan = await cleanup.scan('~');
    const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
    expect(result.items[0]?.status).toBe('failed');
    expect(result.movedBytes).toBe(0);
    expect(await fs.readdir(cache)).toEqual(['cache.js']);
    expect(await fs.readFile(path.join(cache, 'cache.js'), 'utf8')).toBe('conteúdo sintético');
  });
  it('preserva original novo e arquivo temporário quando a restauração não pode ocorrer', async () => {
    const cleanup = service({
      trash: async () => {
        await write(path.join(cache, 'cache.js'), 'novo');
        throw new Error('Finder recusou');
      },
    });
    const plan = await cleanup.scan('~');
    const result = await cleanup.execute(plan.id, [plan.files[0]!.id]);
    expect(result.items[0]?.message).toContain('recuperação manual');
    expect(await fs.readFile(path.join(cache, 'cache.js'), 'utf8')).toBe('novo');
    const staging = (await fs.readdir(cache)).find((name) => name.startsWith('.macpit-cleanup-'))!;
    expect(await fs.readFile(path.join(cache, staging, 'arquivos', 'cache.js'), 'utf8')).toBe('conteúdo sintético');
    expect(JSON.parse(await fs.readFile(path.join(cache, staging, 'recuperacao.json'), 'utf8'))).toEqual({
      originalPath: path.join(cache, 'cache.js'),
    });
  });
  it('cancela análise e não publica plano', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(service().scan('~', controller.signal)).rejects.toMatchObject({ statusCode: 499 });
  });
  it('bloqueia replay concorrente antes de chamar a lixeira', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleanup = service({
      inUse: async () => {
        await gate;
        return false;
      },
    });
    const plan = await cleanup.scan('~');
    const pending = cleanup.execute(plan.id, [plan.files[0]!.id]);
    await expect(cleanup.execute(plan.id, [plan.files[0]!.id])).rejects.toMatchObject({ statusCode: 409 });
    release();
    await pending;
    expect(trash).toHaveBeenCalledTimes(1);
  });
  it('só revela arquivo da prévia e revalida antes de abrir', async () => {
    const open = vi.fn(async () => {});
    const cleanup = service({ open });
    const plan = await cleanup.scan('~');
    await expect(cleanup.open(plan.id, randomUUID())).rejects.toMatchObject({ statusCode: 400 });
    await cleanup.open(plan.id, plan.files[0]!.id);
    expect(open).toHaveBeenCalledWith(plan.files[0]!.path);
    await fs.writeFile(plan.files[0]!.path, 'mudou');
    await expect(cleanup.open(plan.id, plan.files[0]!.id)).rejects.toThrow();
  });
  it('rotas exigem sessão, origem válida, confirmação explícita e IDs do plano', async () => {
    const config = testConfig();
    const { app } = await buildApp(config, TOKEN, { cleanupDeps: { home, uid, trash, inUse } });
    try {
      const scanUrl = '/api/disk/cleanup/scan';
      expect(
        (await app.inject({ method: 'POST', url: scanUrl, headers: HOST, payload: { path: '~' } })).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: scanUrl,
            headers: { ...AUTH, origin: 'https://evil.example' },
            payload: { path: '~' },
          })
        ).statusCode,
      ).toBe(403);
      const scan = await app.inject({ method: 'POST', url: scanUrl, headers: AUTH, payload: { path: '~' } });
      expect(scan.statusCode).toBe(200);
      expect(scan.headers['cache-control']).toBe('no-store');
      const plan = scan.json();
      for (const confirm of [undefined, false]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/disk/cleanup/execute',
          headers: AUTH,
          payload: { planId: plan.id, fileIds: [plan.files[0].id], confirm },
        });
        expect(response.statusCode).toBe(400);
      }
      const response = await app.inject({
        method: 'POST',
        url: '/api/disk/cleanup/execute',
        headers: AUTH,
        payload: { planId: plan.id, fileIds: [plan.files[0].id], confirm: true },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().items[0].status).toBe('moved');
    } finally {
      await app.close();
      await fs.rm(config.dataDir, { recursive: true, force: true });
    }
  });
});

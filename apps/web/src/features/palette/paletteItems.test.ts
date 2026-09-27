import type { Action, Repo } from '@macpit/shared';
import { describe, expect, it } from 'vitest';
import { buildItems, groupItems, score } from './paletteItems';

const act = (name: string, extra: Partial<Action> = {}) =>
  ({
    id: name,
    name,
    command: 'x',
    params: [],
    persistent: false,
    runningCount: 0,
    favorite: false,
    service: null,
    ...extra,
  }) as Action;

describe('score', () => {
  it('prefixo > palavra > contém > subsequência; ignora acentos', () => {
    expect(score('Túnel banco', 'tun')).toBeGreaterThan(score('Meu túnel', 'tun'));
    expect(score('Meu túnel', 'tun')).toBeGreaterThan(score('retunar', 'tun'));
    expect(score('retunar', 'tun')).toBeGreaterThan(score('t-u-n', 'tun'));
    expect(score('processos', 'prcs')).toBeGreaterThan(0);
    expect(score('disco', 'xyz')).toBe(0);
  });
});

describe('buildItems', () => {
  it('ações primeiro, depois páginas; busca de porta e processo', () => {
    const items = buildItems('tun', [
      act('Túnel DB', { params: [{ name: 'h', secret: false, type: 'text' }] }),
      act('build'),
    ]);
    expect(items[0]).toMatchObject({ kind: 'action', label: 'Túnel DB', hint: 'pede h', primary: true });
    expect(items.some((i) => i.label === 'build')).toBe(false);
    expect(buildItems('5432', [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'search', to: '/ports?q=5432' })]),
    );
    expect(buildItems('', []).map((i) => i.label)).toContain('Configurações');
  });

  it('número vai para busca de porta, sem casar ações por letras soltas do comando (bug real)', () => {
    const tunel = act('Túnel banco', {
      favorite: true,
      command: 'echo "tunel aberto em localhost:8799"; exec python3 -m http.server 8799 --bind 127.0.0.1',
    });
    const items = buildItems('8811', [tunel]);
    expect(items[0]).toMatchObject({ kind: 'search', to: '/ports?q=8811' });
    expect(items.some((i) => i.kind === 'action')).toBe(false);
    // mas um trecho contínuo do comando ainda encontra a ação
    expect(buildItems('http.server', [tunel]).some((i) => i.kind === 'action')).toBe(true);
    expect(buildItems('8799', [tunel])[0]).toMatchObject({ kind: 'search' });
  });

  it('serviço rodando sugere abrir terminal', () => {
    const svc = act('Túnel', { persistent: true, service: { state: 'up', port: 5432 } as Action['service'] });
    expect(buildItems('tun', [svc])[0]).toMatchObject({ hint: 'conectado :5432', primary: false });
    const run = act('build', { runningCount: 1 });
    expect(buildItems('build', [run])[0]!.hint).toBe('abrir terminal');
  });

  it('repositórios do GitHub: só ao digitar, abrem o github.com e nunca por número de porta', () => {
    const repo = (name: string, github: string | null): Repo =>
      ({ id: name, name, path: `/c/${name}`, remote: null, github, branch: 'main', vars: [], imported: true }) as Repo;
    const repos = [
      repo('loja', 'acme/loja'),
      repo('rascunho', null),
      repo('api8080', 'acme/api8080'),
      { ...repo('oculto', 'acme/oculto'), imported: false },
    ];
    expect(buildItems('', [], repos).some((i) => i.kind === 'github')).toBe(false);
    expect(buildItems('loja', [], repos)[0]).toMatchObject({
      kind: 'github',
      label: 'acme/loja',
      url: 'https://github.com/acme/loja',
    });
    expect(
      buildItems('gh', [], repos)
        .filter((i) => i.kind === 'github')
        .map((i) => i.label),
    ).toEqual(['acme/loja', 'acme/api8080']);
    expect(buildItems('oculto', [], repos).some((i) => i.kind === 'github')).toBe(false);
    expect(buildItems('8080', [], repos).some((i) => i.kind === 'github')).toBe(false);
    expect(buildItems('rasc', [], repos).some((i) => i.kind === 'github')).toBe(false);
    expect(buildItems('github', [], []).map((i) => i.label)).toContain('Repositórios');
  });

  it('grupos na ordem do design; número de porta põe "Buscar" primeiro', () => {
    const titles = (q: string) => groupItems(buildItems(q, [act('Túnel 8811')])).map((g) => g.title);
    expect(titles('')).toEqual(['Ações', 'Páginas', 'Buscar']);
    expect(titles('8811')).toEqual(['Buscar', 'Ações']);
    expect(
      groupItems(buildItems('', []))
        .find((g) => g.title === 'Buscar')!
        .items.map((i) => i.label),
    ).toEqual(['Processos: “…”', 'Portas: “…”']);
  });
});

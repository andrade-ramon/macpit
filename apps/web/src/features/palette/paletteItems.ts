import type { Action, Repo } from '@macpit/shared';
import { NAV_ITEMS } from '../../components/layout/nav';
import { serviceBadge } from '../actions/actionUtils';

interface Base {
  id: string;
  label: string;
  hint: string;
  /** Ícone no quadradinho à esquerda. */
  icon: string;
  /** Dica em destaque (cor de destaque): ações que executam. */
  primary?: boolean;
}

export type PaletteItem =
  | (Base & { kind: 'page'; to: string })
  | (Base & { kind: 'action'; action: Action })
  | (Base & { kind: 'search'; to: string })
  /** Abre o repositório no github.com (nova aba). */
  | (Base & { kind: 'github'; url: string });

export interface PaletteGroup {
  title: string;
  items: PaletteItem[];
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Pontua `text` para a busca `q` (maior = melhor; 0 = não bate).
 * Prefixo > início de palavra > contém > letras em ordem (subsequência).
 */
export function score(text: string, q: string, allowSubsequence = true): number {
  const t = norm(text);
  const n = norm(q.trim());
  if (!n) return 1;
  if (t.startsWith(n)) return 100 - t.length / 100;
  if (t.split(/[\s/_.-]+/).some((w) => w.startsWith(n))) return 80;
  if (t.includes(n)) return 60;
  if (!allowSubsequence) return 0;
  let i = 0;
  for (const c of t) if (c === n[i]) i++;
  return i === n.length ? 20 : 0;
}

/** Busca que parece número de porta: vai direto para Portas (nunca executa uma ação por engano). */
const PORT_QUERY = /^\d{1,5}$/;

const KEYWORDS: Record<string, string> = {
  '/': 'home inicio cpu memoria',
  '/processes': 'ps kill',
  '/ports': 'lsof listen',
  '/disk': 'df du espaco',
  '/actions': 'comandos scripts tunel',
  '/repos': 'github git projetos repos',
  '/settings': 'notificacoes ajustes aparencia tema',
};

/** Monta e ordena os itens da paleta para a busca atual. */
export function buildItems(q: string, actions: readonly Action[], repos: readonly Repo[] = []): PaletteItem[] {
  const items: Array<PaletteItem & { s: number }> = [];
  const t = q.trim();
  const portQuery = PORT_QUERY.test(t);
  for (const a of actions) {
    // Escolher uma ação na paleta a EXECUTA: só casa por trecho contínuo (nunca letras soltas no
    // comando/grupo) e nunca por número de porta — senão "8811" rodava uma ação com "8…8…1…1" no texto.
    if (portQuery && score(a.name, t, false) === 0) continue;
    const s = Math.max(score(a.name, q), score(a.group ?? '', q, false) * 0.8, score(a.command, q, false) * 0.5);
    if (s > 0) {
      const svcRunning = a.persistent && a.service && a.service.state !== 'stopped';
      const running = a.persistent ? svcRunning : a.runningCount > 0;
      items.push({
        kind: 'action',
        id: `a:${a.id}`,
        icon: a.icon || (a.persistent ? '⇄' : '▶'),
        label: a.name,
        hint: svcRunning
          ? serviceBadge(a.service!).text
          : running
            ? 'abrir terminal'
            : a.params.length
              ? `pede ${a.params.map((p) => p.label || p.name).join(', ')}`
              : '↵ ↵ executar',
        primary: !running,
        action: a,
        s: s + (a.favorite ? 5 : 0),
      });
    }
  }
  for (const p of NAV_ITEMS) {
    const s = Math.max(score(p.label, q), score(KEYWORDS[p.to] ?? '', q) * 0.7);
    if (s > 0)
      items.push({ kind: 'page', id: `p:${p.to}`, icon: p.icon, label: p.label, hint: p.keys, to: p.to, s: s * 0.9 });
  }
  // Repositórios do GitHub só aparecem ao digitar (não poluem a lista inicial); "gh" ou "github" lista todos.
  if (t && !portQuery) {
    const all = /^(gh|github)$/i.test(t);
    for (const r of repos) {
      if (!r.github || !r.imported) continue;
      const s = all ? 50 : Math.max(score(r.github, q, false), score(r.name, q, false)) * 0.85;
      if (s > 0) {
        items.push({
          kind: 'github',
          id: `g:${r.id}`,
          icon: '⎇',
          label: r.github,
          hint: 'abrir ↗',
          url: `https://github.com/${r.github}`,
          s,
        });
      }
    }
  }
  // Buscar: sempre presentes (com a busca vazia abrem a página sem filtro)
  const enc = encodeURIComponent(t);
  items.push(
    portQuery
      ? // sempre no topo: Enter com um número busca a porta, nunca executa nada
        {
          kind: 'search',
          id: 'port',
          icon: '⇄',
          label: `Porta ${t}`,
          hint: 'buscar em Portas',
          to: `/ports?q=${t}`,
          s: 1_000,
        }
      : {
          kind: 'search',
          id: 'port',
          icon: '⇄',
          label: `Portas: “${t || '…'}”`,
          hint: 'abre Portas filtrado',
          to: t ? `/ports?q=${enc}` : '/ports',
          s: 0.4,
        },
    {
      kind: 'search',
      id: 'proc',
      icon: '≡',
      label: `Processos: “${t || '…'}”`,
      hint: 'abre Processos filtrado',
      to: t ? `/processes?q=${enc}` : '/processes',
      s: 0.5,
    },
  );
  return items.sort((a, b) => b.s - a.s).map(({ s: _s, ...i }) => i as PaletteItem);
}

const GROUP_TITLE: Record<PaletteItem['kind'], string> = {
  action: 'Ações',
  page: 'Páginas',
  search: 'Buscar',
  github: 'GitHub',
};
const GROUP_LIMIT: Record<PaletteItem['kind'], number> = { action: 6, page: 7, search: 3, github: 4 };

/**
 * Agrupa na ordem do design (Ações, Páginas, Buscar, GitHub), mantendo a ordem de relevância dentro
 * de cada grupo. Com um número (porta), "Buscar" vem primeiro: Enter nunca executa nada por engano.
 */
export function groupItems(items: readonly PaletteItem[]): PaletteGroup[] {
  const order: Array<PaletteItem['kind']> =
    items[0]?.kind === 'search' ? ['search', 'action', 'page', 'github'] : ['action', 'page', 'search', 'github'];
  return order
    .map((kind) => ({
      title: GROUP_TITLE[kind],
      items: items.filter((i) => i.kind === kind).slice(0, GROUP_LIMIT[kind]),
    }))
    .filter((g) => g.items.length > 0);
}

export type ShortcutAction =
  { kind: 'navigate'; to: string } | { kind: 'focusSearch' } | { kind: 'help' } | { kind: 'theme' };

/** `g` + tecla → página (estilo GitHub). */
export const GO_KEYS: Record<string, { to: string; label: string }> = {
  h: { to: '/', label: 'Visão geral' },
  p: { to: '/processes', label: 'Processos' },
  o: { to: '/ports', label: 'Portas' },
  d: { to: '/disk', label: 'Disco' },
  a: { to: '/actions', label: 'Ações' },
  r: { to: '/repos', label: 'Repositórios' },
  s: { to: '/settings', label: 'Configurações' },
};

export const SHORTCUT_HELP: Array<{ keys: string; description: string }> = [
  { keys: '⌘K', description: 'Paleta de comandos' },
  ...Object.entries(GO_KEYS).map(([k, v]) => ({ keys: `g ${k}`, description: v.label })),
  { keys: '/', description: 'Focar a busca da página' },
  { keys: 't', description: 'Alternar paleta de cores' },
  { keys: '?', description: 'Mostrar os atalhos' },
  { keys: 'Esc', description: 'Fechar diálogo / painel' },
];

/**
 * Máquina de estados dos atalhos de uma tecla. `pending` guarda o `g` à espera da 2ª tecla.
 * Teclas sem significado são ignoradas (não "engolem" nada da página).
 */
export function resolveShortcut(
  pending: string | null,
  key: string,
): { action?: ShortcutAction; pending: string | null } {
  if (pending === 'g') {
    const target = GO_KEYS[key.toLowerCase()];
    return target ? { action: { kind: 'navigate', to: target.to }, pending: null } : { pending: null };
  }
  switch (key) {
    case 'g':
      return { pending: 'g' };
    case '/':
      return { action: { kind: 'focusSearch' }, pending: null };
    case '?':
      return { action: { kind: 'help' }, pending: null };
    case 't':
      return { action: { kind: 'theme' }, pending: null };
    default:
      return { pending: null };
  }
}

/** Não dispara atalhos enquanto se digita (inputs, xterm, editores) ou com modificadores. */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return Boolean(el.closest('.xterm, dialog[open]'));
}

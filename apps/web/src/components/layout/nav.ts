export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Atalho `g` + tecla. */
  keys: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Visão geral', icon: '◉', keys: 'g h' },
  { to: '/processes', label: 'Processos', icon: '≡', keys: 'g p' },
  { to: '/ports', label: 'Portas', icon: '⇄', keys: 'g o' },
  { to: '/disk', label: 'Disco', icon: '◧', keys: 'g d' },
  { to: '/actions', label: 'Ações', icon: '▶', keys: 'g a' },
  { to: '/repos', label: 'Repositórios', icon: '⎇', keys: 'g r' },
  { to: '/panels', label: 'Painéis', icon: '▦', keys: 'g b' },
  { to: '/settings', label: 'Configurações', icon: '⚙', keys: 'g s' },
];

import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { RunLauncherProvider } from '../../features/actions/RunLauncher';
import { useActions } from '../../features/actions/useActions';
import { useDisk } from '../../features/disk/useDisk';
import { CommandPalette, usePaletteHotkey } from '../../features/palette/CommandPalette';
import { ShortcutsDialog } from '../../features/shortcuts/ShortcutsDialog';
import { useGlobalShortcuts } from '../../features/shortcuts/useGlobalShortcuts';
import { DockProvider, useDock } from '../../features/terminal/DockContext';
import { TerminalDock } from '../../features/terminal/TerminalDock';
import { useWsStatus } from '../../hooks/useChannel';
import { useHealth } from '../../hooks/useHealth';
import { cyclePalette, PALETTES, useAppearance } from '../../lib/theme';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { LayoutProvider, useLayout } from './LayoutContext';
import { NAV_ITEMS } from './nav';

const WS_DOT = { open: 'var(--ok)', connecting: 'var(--warn)', closed: 'var(--danger)' } as const;
const WS_LABEL = { open: 'conectado', connecting: 'conectando', closed: 'desconectado' } as const;

/** Só avisa depois de alguns segundos desconectado (reconexões rápidas não piscam a tela). */
function useLongDisconnect(status: keyof typeof WS_DOT, delayMs = 4000): boolean {
  const [long, setLong] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLong(status !== 'open'), status === 'open' ? 0 : delayMs);
    return () => clearTimeout(t);
  }, [status, delayMs]);
  return long;
}

export function AppLayout() {
  return (
    <LayoutProvider>
      <DockProvider>
        <RunLauncherProvider>
          <Shell />
        </RunLauncherProvider>
      </DockProvider>
    </LayoutProvider>
  );
}

/** Links antigos `?run=<id>` abrem a execução no terminal do rodapé. */
function useRunParam() {
  const [params, setParams] = useSearchParams();
  const { openRun } = useDock();
  const run = params.get('run');
  useEffect(() => {
    if (!run) return;
    openRun(run);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('run');
        return next;
      },
      { replace: true },
    );
  }, [run, openRun, setParams]);
}

function Shell() {
  const { data: health } = useHealth();
  const status = useWsStatus();
  const offline = useLongDisconnect(status);
  const layout = useLayout();
  const { help, setHelp } = layout;
  const [palette, setPalette] = useState(false);
  const openHelp = useCallback(() => setHelp(true), [setHelp]);
  const togglePalette = useCallback(() => setPalette((p) => !p), []);
  const showFilters = useCallback(() => layout.showRail('left'), [layout]);
  const location = useLocation();
  usePaletteHotkey(togglePalette);
  useGlobalShortcuts({ openHelp, showFilters });
  useRunParam();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {health?.isRoot && (
        <div
          role="alert"
          className="bg-danger px-4 py-1.5 text-center text-[13px] font-bold tracking-[0.02em] text-[#1a0508]"
        >
          ROOT — todos os comandos e ações executam como root
        </div>
      )}
      {offline && (
        <div role="status" className="bg-warn px-4 py-1.5 text-center text-[13px] font-semibold text-[#1a1200]">
          Sem conexão com o servidor do macpit — tentando reconectar… (ele ainda está rodando no terminal?)
        </div>
      )}
      <Header
        user={health ? `${health.user}@${health.hostname}` : undefined}
        status={status}
        onPalette={() => setPalette(true)}
        onHelp={openHelp}
      />
      <div className="app-body">
        <Navigation />
        <div className="app-content">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
      <TerminalDock />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

function Navigation() {
  const { data: disk } = useDisk();
  const { data: actions } = useActions();
  const badges: Record<string, number> = {
    '/disk': disk?.volumes.filter((v) => v.alert).length ?? 0,
    '/actions': actions?.filter((a) => a.persistent && a.service?.state === 'unhealthy').length ?? 0,
  };
  return (
    <nav aria-label="Principal" className="app-navigation">
      {NAV_ITEMS.map((n, i) => (
        <div key={n.to}>
          {(i === 0 || i === 4) && <div className="navigation-group">{i === 0 ? 'Monitorar' : 'Trabalhar'}</div>}
          <NavLink
            to={n.to}
            end={n.to === '/'}
            title={`${n.label} (${n.keys})`}
            aria-label={n.label}
            className={({ isActive }) => `navigation-link ${isActive ? 'navigation-active' : ''}`}
          >
            <span aria-hidden="true" className="navigation-icon">
              {n.icon}
            </span>
            <span>{n.label}</span>
            {Boolean(badges[n.to]) && (
              <span className="ml-auto text-xs text-danger" aria-label={`${badges[n.to]} alertas`}>
                {badges[n.to]}
              </span>
            )}
          </NavLink>
        </div>
      ))}
    </nav>
  );
}

function Header({
  user,
  status,
  onPalette,
  onHelp,
}: {
  user: string | undefined;
  status: keyof typeof WS_DOT;
  onPalette: () => void;
  onHelp: () => void;
}) {
  const { mid, rail, toggleRail } = useLayout();
  const { palette } = useAppearance();
  const seg = (active: boolean) => (active ? 'bg-panel2 text-text' : 'bg-transparent text-text3');

  return (
    <header className="app-header">
      <div className="flex min-w-0 flex-[1_1_0] items-center gap-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent font-mono text-[15px] font-bold text-accent-ink">
          &gt;_
        </span>
        <span className="whitespace-nowrap font-mono text-[15px] font-semibold tracking-[-0.01em]">macpit</span>
        <span className="header-connection inline-flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap border-l border-line pl-3 text-xs text-text2">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: WS_DOT[status] }} />
          {WS_LABEL[status]}
          {user ? ` · ${user}` : ''}
        </span>
      </div>
      <div className="flex min-w-0 flex-[1_1_0] items-center justify-end gap-2">
        <div className="flex shrink-0 gap-0.5 rounded-[10px] border border-line bg-bg p-[3px]">
          <button
            onClick={() => toggleRail('left')}
            title="Filtros e contexto"
            aria-pressed={rail === 'left'}
            className={`h-7 rounded-[7px] border-0 px-2.5 text-xs font-medium ${seg(rail === 'left')}`}
          >
            ◧ Filtros
          </button>
          <button
            onClick={() => toggleRail('right')}
            title="Detalhes e ações"
            aria-pressed={rail === 'right'}
            className={`h-7 rounded-[7px] border-0 px-2.5 text-xs font-medium ${seg(rail === 'right')}`}
          >
            Detalhes ◨
          </button>
        </div>
        <button
          onClick={onPalette}
          aria-label="Abrir paleta de comandos"
          className="flex h-9 min-w-9 shrink items-center justify-center gap-2.5 overflow-hidden rounded-[10px] border border-line2 bg-bg px-3 text-left text-text3 hover:border-text3"
          style={{ width: mid ? 260 : 36 }}
        >
          <span className="text-[13px]">⌕</span>
          {mid && (
            <>
              <span className="flex-1 truncate text-[13px]">Buscar ações e páginas</span>
              <kbd className="rounded-[5px] border border-line2 px-1.5 py-px text-[11px] text-text2">⌘K</kbd>
            </>
          )}
        </button>
        <button
          onClick={onHelp}
          title="Atalhos de teclado (?)"
          aria-label="Atalhos de teclado"
          className="h-9 w-9 shrink-0 rounded-[10px] border border-line2 bg-bg font-semibold text-text2"
        >
          ?
        </button>
        <button
          onClick={cyclePalette}
          title={`Tema: ${PALETTES.find((p) => p.id === palette)?.name} (t)`}
          aria-label="Alternar paleta de cores"
          className="h-9 w-9 shrink-0 rounded-[10px] border border-line2 bg-bg text-text2"
        >
          ◐
        </button>
      </div>
    </header>
  );
}

import type { Run, RunStatus, ServiceState } from '@macpit/shared';
import { describeRun, serviceBadge } from '../actions/actionUtils';

/** Cores do design por estado de execução: [fundo do selo, texto do selo, ponto]. */
export const RUN_STYLE: Record<RunStatus, { bg: string; fg: string; dot: string }> = {
  running: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--ok)' },
  exited: { bg: 'var(--panel3)', fg: 'var(--text2)', dot: 'var(--text3)' },
  failed: { bg: 'var(--danger-soft)', fg: 'var(--danger)', dot: 'var(--danger)' },
  killed: { bg: 'rgba(242,183,74,.14)', fg: 'var(--warn)', dot: 'var(--warn)' },
  interrupted: { bg: 'rgba(242,183,74,.14)', fg: 'var(--warn)', dot: 'var(--warn)' },
};

export interface Badge {
  text: string;
  bg: string;
  fg: string;
  dot: string;
  /** Rodando (mostra Parar/Terminal em vez de Executar). */
  active: boolean;
  /** Ponto pulsando. */
  live: boolean;
}

/** Selo de um serviço: `conectado :5432`, `sem resposta :20000`, `parado · código 0`… */
export function serviceStyle(s: ServiceState, now = Date.now()): Badge {
  const b = serviceBadge(s, now);
  const map: Record<ServiceState['state'], Omit<Badge, 'text' | 'active'>> = {
    up: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--ok)', live: true },
    running: { bg: 'var(--accent-soft)', fg: 'var(--accent)', dot: 'var(--ok)', live: true },
    starting: { bg: 'rgba(242,183,74,.14)', fg: 'var(--warn)', dot: 'var(--warn)', live: true },
    restarting: { bg: 'rgba(242,183,74,.14)', fg: 'var(--warn)', dot: 'var(--warn)', live: false },
    unhealthy: { bg: 'var(--danger-soft)', fg: 'var(--danger)', dot: 'var(--danger)', live: false },
    stopped: { bg: 'var(--panel3)', fg: 'var(--text2)', dot: 'var(--text3)', live: false },
  };
  return { text: b.text, active: b.active, ...map[s.state] };
}

/** Selo da última execução de uma ação comum. */
export function runStyle(r: Pick<Run, 'status' | 'exitCode' | 'signal'>): Badge {
  const st = RUN_STYLE[r.status];
  return { text: describeRun(r), ...st, active: r.status === 'running', live: r.status === 'running' };
}

export const NEVER_RUN: Badge = {
  text: 'nunca executada',
  bg: 'transparent',
  fg: 'var(--text3)',
  dot: 'var(--text3)',
  active: false,
  live: false,
};

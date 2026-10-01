import type { Db } from '../db/index.js';

export type AuditKind = 'kill' | 'tail' | 'run' | 'stop' | 'repo_vars' | 'restart' | 'ai' | 'cleanup';

export type Audit = (kind: AuditKind, target: string, detail?: Record<string, unknown>) => void;

/**
 * Auditoria de ações sensíveis na tabela `audit_log` (a partir da fase 5).
 * Até a fase 4 ia para `<dataDir>/audit.log`; esse arquivo, se existir, fica como histórico.
 */
export function createAudit(db: Db): Audit {
  const insert = db.prepare('INSERT INTO audit_log (ts, kind, target, detail) VALUES (?, ?, ?, ?)');
  return (kind, target, detail = {}) => {
    insert.run(Date.now(), kind, target, JSON.stringify({ uid: process.getuid?.(), ...detail }));
  };
}

export const noopAudit: Audit = () => {};

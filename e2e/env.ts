import os from 'node:os';
import path from 'node:path';

/** Constantes do E2E (sem efeitos colaterais: este módulo é importado também pelos workers). */
export const E2E_PORT = 7799;
export const E2E_TOKEN = 'e2e' + '0'.repeat(61);
export const E2E_DATA_DIR = path.join(os.tmpdir(), 'macpit-e2e');

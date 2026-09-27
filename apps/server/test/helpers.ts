import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type Config } from '../src/config/index.js';

export const TOKEN = 'a'.repeat(64);

export function testConfig(overrides: Record<string, string> = {}): Config {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-test-'));
  return loadConfig({
    NODE_ENV: 'test',
    MACPIT_PORT: '7777',
    MACPIT_DATA_DIR: dataDir,
    MACPIT_WEB_DIST: path.join(dataDir, 'no-web'),
    MACPIT_SAMPLE_INTERVAL_MS: '250',
    ...overrides,
  });
}

export const HOST = { host: '127.0.0.1:7777' };
export const AUTH = { ...HOST, cookie: `macpit_session=${TOKEN}` };

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Health } from '@macpit/shared';
import type { Config } from '../../config/index.js';

function readVersion(serverRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function isRootUser(): boolean {
  return process.getuid?.() === 0;
}

export function createHealth(config: Config): () => Health {
  const version = readVersion(config.serverRoot);
  const user = os.userInfo().username;
  return () => ({
    ok: true,
    version,
    user,
    isRoot: isRootUser(),
    hostname: os.hostname(),
    platform: process.platform,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    sampleIntervalMs: config.sampleIntervalMs,
  });
}

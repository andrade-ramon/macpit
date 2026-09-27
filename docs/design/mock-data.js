// Dados de exemplo (baseados nos tipos de @macpit/shared) compartilhados entre a recriação e o redesign.
(function () {
  const now = Date.now();
  const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const r = rnd(42);
  const series = (base, amp, n = 60) => Array.from({ length: n }, (_, i) => Math.max(0, base + Math.sin(i / 6) * amp * 0.6 + (r() - 0.5) * amp));
  const GB = 1024 ** 3, MB = 1024 ** 2;
  const P = (pid, ppid, name, user, cpu, rssMb, state, elapsed, command, path) => ({ pid, ppid, name, user, cpuPct: cpu, rssBytes: rssMb * MB, memPct: (rssMb * MB) / (32 * GB) * 100, state, elapsedSec: elapsed, command, path: path || '/usr/bin/' + name, startedAt: now - elapsed * 1000 });
  const processes = [
    P(1, 0, 'launchd', 'root', 0.1, 24, 'Ss', 864000, '/sbin/launchd', '/sbin/launchd'),
    P(88, 1, 'WindowServer', '_windowserver', 8.4, 1180, 'Ss', 864000, '/System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer -daemon'),
    P(412, 1, 'Finder', 'lucas', 0.3, 210, 'S', 863000, '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder'),
    P(480, 1, 'Dock', 'lucas', 0.0, 96, 'S', 863000, '/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock'),
    P(2210, 1, 'Google Chrome', 'lucas', 12.6, 890, 'S', 42000, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    P(2231, 2210, 'Google Chrome Helper (Renderer)', 'lucas', 31.2, 640, 'R', 41000, '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper (Renderer).app --type=renderer'),
    P(2240, 2210, 'Google Chrome Helper (GPU)', 'lucas', 6.1, 412, 'S', 41000, '… Helper (GPU).app --type=gpu-process'),
    P(2255, 2210, 'Google Chrome Helper (Renderer)', 'lucas', 2.0, 310, 'S', 39000, '… Helper (Renderer).app --type=renderer --lang=pt-BR'),
    P(3001, 1, 'Code', 'lucas', 4.8, 720, 'S', 18600, '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'),
    P(3020, 3001, 'Code Helper (Plugin)', 'lucas', 1.2, 380, 'S', 18500, '… Code Helper (Plugin) --type=utility --utility-sub-type=node.mojom.NodeService'),
    P(3044, 3001, 'Code Helper (Renderer)', 'lucas', 3.4, 455, 'S', 18500, '… Code Helper (Renderer) --type=renderer'),
    P(4100, 1, 'iTerm2', 'lucas', 0.6, 240, 'S', 30000, '/Applications/iTerm.app/Contents/MacOS/iTerm2'),
    P(4132, 4100, 'zsh', 'lucas', 0.0, 8, 'S+', 29800, '-zsh'),
    P(4190, 4132, 'node', 'lucas', 1.9, 168, 'S', 7200, 'node /Users/lucas/github/acme/macpit/apps/server/dist/index.js', '/opt/homebrew/bin/node'),
    P(4210, 4190, 'node', 'lucas', 0.4, 132, 'S', 7190, 'node /Users/lucas/github/acme/macpit/node_modules/.bin/vite --port 5173', '/opt/homebrew/bin/node'),
    P(4302, 4132, 'ssh', 'lucas', 0.0, 6, 'S', 5400, 'ssh -N -L 5432:db.interno.acme:5432 bastion', '/usr/bin/ssh'),
    P(4410, 4132, 'ssh', 'lucas', 0.0, 6, 'S', 3600, 'ssh -N -L 6379:redis.interno:6379 bastion', '/usr/bin/ssh'),
    P(5001, 1, 'com.docker.backend', 'lucas', 2.7, 512, 'S', 60000, '/Applications/Docker.app/Contents/MacOS/com.docker.backend run'),
    P(5030, 5001, 'qemu-system-aarch64', 'lucas', 9.5, 4300, 'S', 59900, 'qemu-system-aarch64 -accel hvf -m 8192 …'),
    P(5210, 1, 'postgres', 'lucas', 0.8, 96, 'S', 86000, '/opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16'),
    P(5222, 5210, 'postgres: checkpointer', 'lucas', 0.0, 22, 'S', 86000, 'postgres: checkpointer'),
    P(6120, 1, 'Slack', 'lucas', 1.1, 380, 'S', 50000, '/Applications/Slack.app/Contents/MacOS/Slack'),
    P(6300, 1, 'Spotify', 'lucas', 0.9, 290, 'S', 21000, '/Applications/Spotify.app/Contents/MacOS/Spotify'),
    P(7011, 1, 'mds_stores', 'root', 18.3, 620, 'R', 864000, '/System/Library/Frameworks/CoreServices.framework/Frameworks/Metadata.framework/Support/mds_stores'),
    P(7402, 1, 'kernel_task', 'root', 3.2, 1900, 'S', 864000, 'kernel_task'),
    P(8001, 4132, 'python3', 'lucas', 0.0, 40, 'Z', 900, 'python3 scripts/export.py', '/opt/homebrew/bin/python3'),
    P(8120, 1, 'cloudflared', 'lucas', 0.2, 44, 'S', 12000, 'cloudflared tunnel run acme-dev'),
  ];
  const ports = [
    { port: 5173, protocol: 'TCP', scope: 'network', bindings: '*', pid: 4210, command: 'node', commandLine: 'vite --port 5173', user: 'lucas' },
    { port: 7777, protocol: 'TCP', scope: 'local', bindings: '127.0.0.1', pid: 4190, command: 'node', commandLine: 'macpit server', user: 'lucas' },
    { port: 5432, protocol: 'TCP', scope: 'local', bindings: '127.0.0.1', pid: 4302, command: 'ssh', commandLine: 'ssh -N -L 5432:db.interno.acme:5432 bastion', user: 'lucas' },
    { port: 5433, protocol: 'TCP', scope: 'local', bindings: '127.0.0.1', pid: 5210, command: 'postgres', commandLine: 'postgres -D /opt/homebrew/var/postgresql@16', user: 'lucas' },
    { port: 6379, protocol: 'TCP', scope: 'local', bindings: '127.0.0.1', pid: 4410, command: 'ssh', commandLine: 'ssh -N -L 6379:redis.interno:6379 bastion', user: 'lucas' },
    { port: 3000, protocol: 'TCP', scope: 'network', bindings: '*', pid: 5001, command: 'com.docker.backend', commandLine: 'docker proxy → web:3000', user: 'lucas' },
    { port: 8080, protocol: 'TCP', scope: 'network', bindings: '0.0.0.0', pid: 5001, command: 'com.docker.backend', commandLine: 'docker proxy → api:8080', user: 'lucas' },
    { port: 22, protocol: 'TCP', scope: 'network', bindings: '*', pid: 1, command: 'launchd', commandLine: 'sshd (Compartilhamento remoto)', user: 'root' },
    { port: 5353, protocol: 'UDP', scope: 'network', bindings: '*', pid: 112, command: 'mDNSResponder', commandLine: '', user: '_mdnsresponder' },
    { port: 20000, protocol: 'TCP', scope: 'local', bindings: '127.0.0.1', pid: 8120, command: 'cloudflared', commandLine: 'cloudflared tunnel run acme-dev (metrics)', user: 'lucas' },
    { port: 63342, protocol: 'TCP', scope: 'local', bindings: '::1', pid: 6120, command: 'Slack', commandLine: '', user: 'lucas' },
  ];
  const volumes = [
    { name: 'Macintosh HD', mount: '/', totalBytes: 994 * GB, usedBytes: 812 * GB, availableBytes: 182 * GB, usedPct: 81.7, alert: false },
    { name: 'Dados', mount: '/System/Volumes/Data', totalBytes: 994 * GB, usedBytes: 801 * GB, availableBytes: 182 * GB, usedPct: 80.6, alert: false },
    { name: 'Time Machine', mount: '/Volumes/Time Machine', totalBytes: 2000 * GB, usedBytes: 1840 * GB, availableBytes: 160 * GB, usedPct: 92.0, alert: true },
  ];
  const diskHistory = Array.from({ length: 48 }, (_, i) => ({ ts: now - (47 - i) * 30 * 60000, pct: 78.5 + i * 0.065 + Math.sin(i / 5) * 0.4 }));
  const duEntries = [
    { name: 'Library', path: '/Users/lucas/Library', sizeBytes: 168 * GB },
    { name: 'github', path: '/Users/lucas/github', sizeBytes: 94 * GB },
    { name: 'Movies', path: '/Users/lucas/Movies', sizeBytes: 61 * GB },
    { name: 'Downloads', path: '/Users/lucas/Downloads', sizeBytes: 38 * GB },
    { name: '.docker', path: '/Users/lucas/.docker', sizeBytes: 22 * GB },
    { name: 'Pictures', path: '/Users/lucas/Pictures', sizeBytes: 14 * GB },
    { name: '.npm', path: '/Users/lucas/.npm', sizeBytes: 6.2 * GB },
    { name: 'Documents', path: '/Users/lucas/Documents', sizeBytes: 4.1 * GB },
    { name: '.cache', path: '/Users/lucas/.cache', sizeBytes: 3.3 * GB },
    { name: 'Desktop', path: '/Users/lucas/Desktop', sizeBytes: 1.2 * GB },
  ];
  const A = (id, name, command, o) => Object.assign({ id, name, command, cwd: '', group: '', icon: '', favorite: false, params: [], persistent: false, autoRestart: false, autoStart: false, runningCount: 0, lastRun: null, service: null, env: {} }, o);
  const actions = [
    A('a1', 'Túnel banco produção', 'ssh -N -L 5432:db.interno.acme:5432 bastion', { icon: '🔌', favorite: true, group: 'Infra', persistent: true, autoRestart: true, autoStart: true, expectedPort: 5432, runningCount: 1, service: { state: 'up', port: 5432, runId: 'r1', restarts: 0 }, lastRun: { id: 'r1', status: 'running', startedAt: now - 5400e3, endedAt: null } }),
    A('a2', 'Túnel Redis', 'ssh -N -L 6379:redis.interno:6379 bastion', { icon: '⇄', group: 'Infra', persistent: true, autoRestart: true, expectedPort: 6379, runningCount: 1, service: { state: 'up', port: 6379, runId: 'r2', restarts: 1 }, lastRun: { id: 'r2', status: 'running', startedAt: now - 3600e3, endedAt: null } }),
    A('a3', 'Cloudflare tunnel dev', 'cloudflared tunnel run acme-dev', { icon: '☁', group: 'Infra', persistent: true, expectedPort: 20000, service: { state: 'unhealthy', port: 20000, runId: 'r3', restarts: 0 }, runningCount: 1, lastRun: { id: 'r3', status: 'running', startedAt: now - 12000e3, endedAt: null } }),
    A('a4', 'Dev server', 'pnpm dev', { icon: '▶', favorite: true, group: 'Projeto acme', cwd: '~/github/acme/app', persistent: true, expectedPort: 5173, service: { state: 'stopped', port: 5173, runId: null, restarts: 0, lastExit: 'código 0' }, lastRun: { id: 'r4', status: 'exited', startedAt: now - 86400e3, endedAt: now - 80000e3, exitCode: 0 } }),
    A('a5', 'Deploy staging', 'git pull && pnpm build && ./scripts/deploy.sh {{ambiente}}', { icon: '🚀', group: 'Projeto acme', cwd: '~/github/acme/app', params: [{ name: 'ambiente', label: 'Ambiente', type: 'text', default: 'staging', secret: false }], lastRun: { id: 'r5', status: 'failed', startedAt: now - 7200e3, endedAt: now - 7100e3, exitCode: 2 } }),
    A('a6', 'Testes do repo', 'pnpm test', { icon: '✓', group: 'Projeto acme', params: [{ name: 'repo', label: 'Repositório', type: 'repo', secret: false }], lastRun: { id: 'r6', status: 'exited', startedAt: now - 3000e3, endedAt: now - 2940e3, exitCode: 0 } }),
    A('a7', 'Limpar caches', 'rm -rf ~/Library/Caches/* && brew cleanup && pnpm store prune', { icon: '🧹', lastRun: { id: 'r7', status: 'killed', startedAt: now - 172800e3, endedAt: now - 172700e3, signal: 'SIGTERM' } }),
    A('a8', 'Backup dotfiles', '~/scripts/backup-dotfiles.sh', { icon: '💾' }),
    A('a9', 'Atualizar brew', 'brew update && brew upgrade', { icon: '🍺', lastRun: { id: 'r8', status: 'exited', startedAt: now - 259200e3, endedAt: now - 258900e3, exitCode: 0 } }),
  ];
  const runs = [
    { id: 'r1', actionId: 'a1', actionName: 'Túnel banco produção', status: 'running', startedAt: now - 5400e3, endedAt: null, pid: 4302, cwd: '~', command: 'ssh -N -L 5432:db.interno.acme:5432 bastion' },
    { id: 'r2', actionId: 'a2', actionName: 'Túnel Redis', status: 'running', startedAt: now - 3600e3, endedAt: null, pid: 4410, cwd: '~', command: 'ssh -N -L 6379:redis.interno:6379 bastion' },
    { id: 'r3', actionId: 'a3', actionName: 'Cloudflare tunnel dev', status: 'running', startedAt: now - 12000e3, endedAt: null, pid: 8120, cwd: '~', command: 'cloudflared tunnel run acme-dev' },
    { id: 'r6', actionId: 'a6', actionName: 'Testes do repo', status: 'exited', startedAt: now - 3000e3, endedAt: now - 2940e3, exitCode: 0, pid: 9120, cwd: '~/github/acme/app', command: 'pnpm test' },
    { id: 'r5', actionId: 'a5', actionName: 'Deploy staging', status: 'failed', startedAt: now - 7200e3, endedAt: now - 7100e3, exitCode: 2, pid: 9001, cwd: '~/github/acme/app', command: 'git pull && pnpm build && ./scripts/deploy.sh staging' },
    { id: 'r4', actionId: 'a4', actionName: 'Dev server', status: 'exited', startedAt: now - 86400e3, endedAt: now - 80000e3, exitCode: 0, pid: 8800, cwd: '~/github/acme/app', command: 'pnpm dev' },
    { id: 'r7', actionId: 'a7', actionName: 'Limpar caches', status: 'killed', startedAt: now - 172800e3, endedAt: now - 172700e3, signal: 'SIGTERM', pid: 7700, cwd: '~', command: 'rm -rf ~/Library/Caches/* && brew cleanup && pnpm store prune' },
    { id: 'r8', actionId: 'a9', actionName: 'Atualizar brew', status: 'exited', startedAt: now - 259200e3, endedAt: now - 258900e3, exitCode: 0, pid: 7600, cwd: '~', command: 'brew update && brew upgrade' },
  ];
  const terminalLines = {
    r1: ['$ ssh -N -L 5432:db.interno.acme:5432 bastion', 'Authenticated to bastion.acme.com ([10.0.4.12]:22) using "publickey".', 'Local forwarding listening on 127.0.0.1 port 5432.', 'channel 2: new [direct-tcpip]', 'channel 3: new [direct-tcpip]', ''],
    r2: ['$ ssh -N -L 6379:redis.interno:6379 bastion', 'Authenticated to bastion.acme.com ([10.0.4.12]:22) using "publickey".', 'Local forwarding listening on 127.0.0.1 port 6379.', ''],
    r3: ['$ cloudflared tunnel run acme-dev', '2026-09-27T13:02:11Z INF Starting tunnel tunnelID=8f1c…', '2026-09-27T13:02:12Z INF Registered tunnel connection connIndex=0 location=gru01', '2026-09-27T14:40:03Z WRN Connection terminated error="read: connection reset by peer"', '2026-09-27T14:40:04Z INF Retrying connection in 2s…', ''],
    r5: ['$ git pull && pnpm build && ./scripts/deploy.sh staging', 'Already up to date.', '> app@2.3.1 build', '> vite build', '✓ 1420 modules transformed.', 'dist/index.html  1.2 kB', '$ ./scripts/deploy.sh staging', 'Enviando para staging.acme.com…', 'rsync: connection unexpectedly closed (0 bytes received so far)', 'Erro: deploy falhou (código 2)'],
    r6: ['$ pnpm test', '> app@2.3.1 test', '> vitest run', ' ✓ src/lib/format.test.ts (12 tests) 14ms', ' ✓ src/features/ports/portFilters.test.ts (8 tests) 9ms', ' Test Files  9 passed (9)', '      Tests  84 passed (84)', '   Duration  4.31s'],
  };
  const repos = [
    { id: 'g1', name: 'macpit', path: '/Users/lucas/github/acme/macpit', github: 'acme/macpit', branch: 'main', vars: [{ name: 'DEPLOY_HOST', secret: false, value: 'monitor.acme.com', hasValue: true }] },
    { id: 'g2', name: 'app', path: '/Users/lucas/github/acme/app', github: 'acme/app', branch: 'feat/checkout-v2', vars: [{ name: 'DEPLOY_HOST', secret: false, value: 'staging.acme.com', hasValue: true }, { name: 'DEPLOY_TOKEN', secret: true, value: '', hasValue: true }] },
    { id: 'g3', name: 'api', path: '/Users/lucas/github/acme/api', github: 'acme/api', branch: 'main', vars: [] },
    { id: 'g4', name: 'infra', path: '/Users/lucas/github/acme/infra', github: 'acme/infra', branch: 'main', vars: [{ name: 'AWS_PROFILE', secret: false, value: 'acme-prod', hasValue: true }] },
    { id: 'g5', name: 'dotfiles', path: '/Users/lucas/github/dotfiles', github: null, remote: null, branch: 'main', vars: [] },
    { id: 'g6', name: 'playground', path: '/Users/lucas/github/playground', github: null, remote: 'git@gitlab.com:lucas/playground.git', branch: 'main', vars: [] },
  ];
  window.MACPIT_DATA = {
    now,
    health: { user: 'lucas', hostname: 'macbook-pro-lucas', version: '1.7.0', isRoot: false, pid: 4190 },
    system: {
      uptimeSec: 864000,
      cpu: { model: 'Apple M3 Max', cores: 16, usagePct: 23.4, userPct: 15.1, systemPct: 8.3 },
      memory: { totalBytes: 32 * GB, usedBytes: 21.4 * GB, usedPct: 66.9, appBytes: 12.1 * GB, wiredBytes: 4.2 * GB, compressedBytes: 2.8 * GB, cachedBytes: 6.3 * GB, freeBytes: 4.3 * GB },
      swap: { usedBytes: 1.2 * GB, totalBytes: 3 * GB },
      load: [4.12, 3.86, 3.41],
      history: { cpu: series(23, 18), mem: series(66, 4), load: series(4, 2.5) },
    },
    processes, ports, volumes, diskHistory, duEntries, actions, runs, terminalLines, repos,
    alertPct: 90,
  };
})();

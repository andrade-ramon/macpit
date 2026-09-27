// O node-pty publica o `spawn-helper` pré-compilado do macOS sem permissão de execução,
// o que faz todo `pty.spawn` falhar com "posix_spawnp failed". Roda no postinstall.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
let root;
try {
  root = path.dirname(require.resolve('node-pty/package.json'));
} catch {
  process.exit(0); // node-pty ainda não instalado
}
for (const dir of ['prebuilds/darwin-arm64', 'prebuilds/darwin-x64', 'build/Release']) {
  const helper = path.join(root, dir, 'spawn-helper');
  if (fs.existsSync(helper)) {
    fs.chmodSync(helper, 0o755);
    console.log(`node-pty: chmod +x ${path.relative(process.cwd(), helper)}`);
  }
}

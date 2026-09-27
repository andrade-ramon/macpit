import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderCommand } from './template.js';

// Executa de verdade no bash: templates ACEITOS + valores maliciosos nunca podem executar código.
const TEMPLATES = [
  'echo {{v}}',
  'echo "prefixo {{v}} sufixo"',
  '[ "{{v}}" = 1 ] || echo nao',
  'test -n {{v}} && echo sim',
  'printf "%s\\n" {{v}}',
  'x={{v}}; echo "$x"',
  'case {{v}} in *) echo caso;; esac',
  'for i in {{v}}; do echo "$i"; done',
  'echo $(echo {{v}})',
  'echo "$(echo {{v}})"',
  'ls {{v}} 2>/dev/null; true',
];

describe.runIf(fs.existsSync('/bin/bash'))('renderCommand no bash real', () => {
  it('nenhum valor malicioso executa código em nenhum template aceito', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-tpl-'));
    const mark = path.join(dir, 'PWNED');
    const payloads = [
      `$(touch ${mark})`,
      `\`touch ${mark}\``,
      `a[$(touch ${mark})]`,
      `1; touch ${mark}`,
      `'; touch ${mark}; '`,
      `" ; touch ${mark} ; "`,
      `$((\`touch ${mark}\`))`,
      `x\ntouch ${mark}`,
      `*`,
    ];
    for (const tpl of TEMPLATES) {
      for (const v of payloads) {
        const { command, env } = renderCommand(tpl, [{ name: 'v' }], { v });
        spawnSync('/bin/bash', ['-c', command], { env: { PATH: process.env.PATH, ...env }, cwd: dir, timeout: 5000 });
        expect(fs.existsSync(mark), `template ${tpl} com valor ${JSON.stringify(v)}`).toBe(false);
      }
    }
  });
});

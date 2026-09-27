import os from 'node:os';
import path from 'node:path';
import type { ShellEntry, ShellImport } from '@macpit/shared';
import { run } from '../../lib/exec.js';

/** Nome de alias "útil" (esconde `...`, `-`, `1`, `2` de navegação do oh-my-zsh). */
const ALIAS_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:+@-]*$/;
const FUNC_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Desfaz as aspas no formato que `alias` imprime: `'texto'`, `'it'\''s'`, `\x` ou texto nu.
 * `$'...'` (ANSI-C) não é suportado → `undefined` (o alias é ignorado).
 */
export function unquoteShell(value: string): string | undefined {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const c = value[i]!;
    if (c === '$' && value[i + 1] === "'") return undefined;
    if (c === "'") {
      const end = value.indexOf("'", i + 1);
      if (end === -1) return undefined;
      out += value.slice(i + 1, end);
      i = end + 1;
    } else if (c === '\\' && i + 1 < value.length) {
      out += value[i + 1];
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Saída de `alias` do zsh (`nome='valor'`) ou do bash (`alias nome='valor'`). */
export function parseAliasOutput(text: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const line of text.split('\n')) {
    const m = /^(?:alias\s+)?([^=\s]+)=(.*)$/.exec(line.trim());
    if (!m || !ALIAS_NAME_RE.test(m[1]!)) continue;
    const value = unquoteShell(m[2]!);
    if (value?.trim()) out.push({ name: m[1]!, value });
  }
  return out;
}

/**
 * Funções definidas nos **seus** arquivos (dentro do home, fora de frameworks como oh-my-zsh/nvm),
 * a partir de linhas `nome<TAB>arquivo`.
 */
export function parseFunctionSources(text: string, home: string): Array<{ name: string; file: string }> {
  const skip = /\/\.(oh-my-zsh|nvm|zinit|antigen|zplug|zim|zprezto|asdf|sdkman|rbenv|pyenv)\//;
  const out: Array<{ name: string; file: string }> = [];
  for (const line of text.split('\n')) {
    const [name, file] = line.split('\t');
    if (!name || !file || !FUNC_NAME_RE.test(name)) continue;
    if (!file.startsWith(home + path.sep) || skip.test(file)) continue;
    out.push({ name, file });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ShellImportDeps {
  shell: string;
  home: string;
  /** Roda um script num shell **interativo** (carrega o rc do usuário) e devolve o stdout. */
  runInteractive: (shell: string, script: string) => Promise<string>;
}

export const defaultShellImportDeps = (): ShellImportDeps => ({
  shell: process.env.SHELL || '/bin/zsh',
  home: os.homedir(),
  runInteractive: async (shell, script) =>
    (
      await run(shell, ['-ic', script], {
        timeoutMs: 15_000,
        okExitCodes: [0, 1],
        env: { ...process.env, TERM: 'dumb' },
      })
    ).stdout,
});

const ZSH_FUNCS = 'for f in ${(k)functions_source}; do print -r -- "$f\t${functions_source[$f]}"; done';

/**
 * Lê aliases (e, no zsh, funções dos seus dotfiles) do shell do usuário.
 * - alias → a ação roda o **valor** expandido (funciona no bash do executor);
 * - função → a ação roda `<shell> -ic '<nome> "$@"' _` (a função só existe no shell interativo dela;
 *   argumentos extras, como `{{porta}}`, podem ser acrescentados ao fim com segurança).
 */
export async function readShellEntries(deps: ShellImportDeps = defaultShellImportDeps()): Promise<ShellImport> {
  const shellName = path.basename(deps.shell);
  const entries: ShellEntry[] = parseAliasOutput(await deps.runInteractive(deps.shell, 'alias')).map((a) => ({
    kind: 'alias',
    name: a.name,
    command: a.value,
    detail: a.value,
  }));
  let warning: string | undefined;
  if (shellName === 'zsh') {
    for (const f of parseFunctionSources(await deps.runInteractive(deps.shell, ZSH_FUNCS), deps.home)) {
      entries.push({
        kind: 'function',
        name: f.name,
        // `"$@"` + `_` (vira $0): argumentos acrescentados depois (ex.: {{porta}}) chegam como argv,
        // nunca como código do zsh. Não use `zsh -ic "fn {{x}}"` — o valor seria interpretado.
        command: `${deps.shell} -ic '${f.name} "$@"' _`,
        detail: f.file.replace(deps.home, '~'),
      });
    }
  } else {
    warning = `importação de funções disponível só para zsh (seu shell: ${shellName}); aliases foram lidos`;
  }
  return { shell: deps.shell, entries, ...(warning ? { warning } : {}) };
}

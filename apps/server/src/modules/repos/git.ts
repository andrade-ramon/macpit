/** Leitura de metadados de repositórios git direto dos arquivos de `.git` (sem executar `git`). */

/** Remotes de um `.git/config`: nome → url. */
export function parseGitRemotes(config: string): Map<string, string> {
  const remotes = new Map<string, string>();
  let current: string | null = null;
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const section = /^\[\s*([^\s\]"]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]$/.exec(line);
    if (section) {
      current = section[1]!.toLowerCase() === 'remote' && section[2] !== undefined ? section[2] : null;
      continue;
    }
    if (current === null) continue;
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*=\s*(.*)$/.exec(line);
    if (kv && kv[1]!.toLowerCase() === 'url' && !remotes.has(current)) {
      remotes.set(current, kv[2]!.replace(/^"(.*)"$/, '$1').trim());
    }
  }
  return remotes;
}

/** `origin`, se existir; senão o primeiro remote. */
export function primaryRemote(remotes: Map<string, string>): string | null {
  return remotes.get('origin') ?? remotes.values().next().value ?? null;
}

/**
 * `owner/nome` se a URL aponta para o GitHub. Aceita https, `git@github.com:`, `ssh://` e aliases de
 * host do `~/.ssh/config` que comecem com `github.com` (ex.: `git@github.com-trabalho:org/repo.git`).
 */
export function parseGithubRemote(url: string | null): string | null {
  if (!url) return null;
  const m =
    /^(?:https?|git|ssh):\/\/(?:[^@/]+@)?(github\.com[^/:]*)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url) ??
    /^(?:[^@/]+@)?(github\.com[^:/]*):\/?([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url);
  if (!m) return null;
  return `${m[2]}/${m[3]}`;
}

/** Branch a partir do conteúdo de `HEAD` (`ref: refs/heads/main`), ou o commit curto se destacado. */
export function parseHead(head: string): string | null {
  const text = head.trim();
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(text);
  if (ref) return ref[1]!;
  return /^[0-9a-f]{40,64}$/i.test(text) ? text.slice(0, 7) : null;
}

/** Caminho do `gitdir:` de um arquivo `.git` (worktrees e submódulos). */
export function parseGitFile(content: string): string | null {
  const m = /^gitdir:\s*(.+)$/m.exec(content);
  return m ? m[1]!.trim() : null;
}

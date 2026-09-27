import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseGitFile, parseGitRemotes, parseGithubRemote, parseHead, primaryRemote } from './git.js';

export interface FoundRepo {
  id: string;
  name: string;
  path: string;
  remote: string | null;
  github: string | null;
  branch: string | null;
}

/** Pastas que nunca contêm projetos (e podem ser enormes). */
const SKIP = new Set(['node_modules', 'Library', 'vendor', 'Pods', 'DerivedData', 'target', 'dist', 'build']);

export const repoId = (repoPath: string) => createHash('sha1').update(repoPath).digest('hex').slice(0, 12);

const readText = (file: string) => fs.readFile(file, 'utf8').catch(() => null);

/** Metadados de um repositório a partir de `<dir>/.git` (pasta ou arquivo `gitdir:`). */
export async function readRepo(dir: string): Promise<FoundRepo | null> {
  const dotGit = path.join(dir, '.git');
  let gitDir = dotGit;
  const st = await fs.lstat(dotGit).catch(() => null);
  if (!st) return null;
  if (st.isFile()) {
    const target = parseGitFile((await readText(dotGit)) ?? '');
    if (!target) return null;
    gitDir = path.resolve(dir, target);
  } else if (!st.isDirectory()) return null;
  // worktree: o config fica no diretório comum
  const common = (await readText(path.join(gitDir, 'commondir')))?.trim();
  const configDir = common ? path.resolve(gitDir, common) : gitDir;
  const remote = primaryRemote(parseGitRemotes((await readText(path.join(configDir, 'config'))) ?? ''));
  return {
    id: repoId(dir),
    name: path.basename(dir),
    path: dir,
    remote,
    github: parseGithubRemote(remote),
    branch: parseHead((await readText(path.join(gitDir, 'HEAD'))) ?? ''),
  };
}

/**
 * Procura repositórios git até `maxDepth` níveis abaixo de cada raiz. Não segue links simbólicos,
 * pula pastas ocultas e de dependências, e não desce dentro de um repositório já encontrado.
 */
export async function scanRepos(
  roots: readonly string[],
  maxDepth: number,
  limits = { maxDirs: 20_000 },
): Promise<{ repos: FoundRepo[]; errors: string[] }> {
  const found = new Map<string, FoundRepo>();
  const errors: string[] = [];
  let visited = 0;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (++visited > limits.maxDirs) return;
    const repo = await readRepo(dir);
    if (repo) {
      found.set(repo.path, repo);
      return;
    }
    if (depth >= maxDepth) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
      await walk(path.join(dir, e.name), depth + 1);
    }
  };

  for (const root of roots) {
    const st = await fs.stat(root).catch(() => null);
    if (!st?.isDirectory()) {
      errors.push(`pasta não encontrada: ${root}`);
      continue;
    }
    await walk(root, 0);
  }
  if (visited > limits.maxDirs)
    errors.push(`varredura interrompida após ${limits.maxDirs} pastas; reduza a profundidade`);
  const repos = [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  return { repos, errors };
}

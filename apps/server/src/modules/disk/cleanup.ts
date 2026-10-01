import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CleanupFile, CleanupPlan, CleanupResult } from '@macpit/shared';
import { CLEANUP_DEFAULT_FILES, CLEANUP_MAX_FILES, CLEANUP_MAX_MIN_BYTES } from '@macpit/shared';
import { HttpError } from '../../lib/http.js';
import { run } from '../../lib/exec.js';
import { noopAudit, type Audit } from '../../lib/audit.js';

const TRASH_SCRIPT = `on run argv
  tell application "Finder"
    delete (POSIX file (item 1 of argv) as alias)
  end tell
end run`;
export interface CleanupDeps {
  home?: string;
  uid?: number;
  now?: () => number;
  inUse?: (file: string) => Promise<boolean>;
  trash?: (file: string) => Promise<void>;
  open?: (file: string) => Promise<void>;
}
interface Snapshot {
  file: CleanupFile;
  stat: Stats;
  parents: Array<{ path: string; stat: Stats }>;
}
interface StoredPlan {
  public: CleanupPlan;
  snapshots: Map<string, Snapshot>;
}
const same = (a: Stats, b: Stats) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.mode === b.mode &&
  a.uid === b.uid &&
  a.nlink === b.nlink;
const within = (root: string, file: string) => file === root || file.startsWith(root + path.sep);
const PROTECTED = new Set([
  '.git',
  '.ssh',
  '.aws',
  '.gnupg',
  '.macpit',
  '.bash-monitor',
  '.Trash',
  'Library',
  'Backups',
  'backups',
]);
const sensitive = (name: string) =>
  /^(\.env(?:\..*)?|credentials|id_[a-z0-9_]+)$|\.(pem|key|p12|pfx|sqlite|sqlite3|db|kdbx)$/i.test(name);

/** Regras locais fechadas; não há shell nem exclusão permanente. */
export class CleanupService {
  private plans = new Map<string, StoredPlan>();
  private scanning = false;
  private executing = false;
  private readonly home: string;
  private readonly uid: number;
  private readonly now: () => number;
  constructor(
    private readonly dataDir: string,
    private readonly audit: Audit = noopAudit,
    private readonly deps: CleanupDeps = {},
  ) {
    this.home = path.resolve(deps.home ?? os.homedir());
    this.uid = deps.uid ?? process.getuid?.() ?? -1;
    this.now = deps.now ?? Date.now;
  }
  private prune() {
    for (const [id, plan] of this.plans) if (plan.public.expiresAt <= this.now()) this.plans.delete(id);
  }
  private get(id: string) {
    this.prune();
    const plan = this.plans.get(id);
    if (!plan) throw new HttpError(409, 'Prévia expirada ou já utilizada. Analise novamente.', 'cleanup_expired');
    return plan;
  }
  private async parents(file: string, cache?: Map<string, Stats>) {
    const result: Snapshot['parents'] = [];
    let current = path.dirname(file);
    while (true) {
      const stat = cache?.get(current) ?? (await fs.lstat(current));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Caminho contém link ou pasta inválida.');
      if (within(this.home, current) && (stat.uid !== this.uid || (stat.mode & 0o022) !== 0))
        throw new Error('Pasta compartilhada ou gravável por outro usuário; limpeza recusada.');
      result.push({ path: current, stat });
      cache?.set(current, stat);
      if (current === path.dirname(current)) break;
      current = path.dirname(current);
    }
    return result;
  }
  private async validate(snapshot: Snapshot, file = snapshot.file.path) {
    for (const parent of snapshot.parents) {
      const stat = await fs.lstat(parent.path);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.ino !== parent.stat.ino ||
        stat.dev !== parent.stat.dev ||
        stat.mode !== parent.stat.mode ||
        stat.uid !== parent.stat.uid
      )
        throw new Error('Uma pasta mudou desde a prévia.');
    }
    const stat = await fs.lstat(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      !same(snapshot.stat, stat) ||
      (file === snapshot.file.path && stat.ctimeMs !== snapshot.stat.ctimeMs)
    )
      throw new Error('Arquivo mudou desde a prévia.');
  }
  async scan(
    input: string,
    signal?: AbortSignal,
    maxFiles = CLEANUP_DEFAULT_FILES,
    minFileBytes = 0,
  ): Promise<CleanupPlan> {
    if (!Number.isSafeInteger(minFileBytes) || minFileBytes < 0 || minFileBytes > CLEANUP_MAX_MIN_BYTES)
      throw new HttpError(400, 'Tamanho mínimo inválido.', 'cleanup_limit');
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > CLEANUP_MAX_FILES)
      throw new HttpError(400, 'Limite de arquivos inválido.', 'cleanup_limit');
    if (this.uid === 0)
      throw new HttpError(403, 'Limpeza indisponível quando o macpit roda como root.', 'cleanup_root');
    if (this.scanning || this.executing)
      throw new HttpError(429, 'Já existe uma análise ou limpeza em andamento.', 'cleanup_busy');
    if (!path.isAbsolute(input) && input !== '~' && !input.startsWith('~/'))
      throw new HttpError(400, 'Use um caminho absoluto ou começando com ~.', 'cleanup_path');
    const root = path.resolve(
      input === '~' ? this.home : input.startsWith('~/') ? path.join(this.home, input.slice(2)) : input,
    );
    if (!within(this.home, root) || within(this.dataDir, root))
      throw new HttpError(400, 'Escolha uma pasta dentro do seu diretório pessoal.', 'cleanup_path');
    const relative = path.relative(this.home, root).split(path.sep);
    if (
      relative.some(
        (name) =>
          PROTECTED.has(name) ||
          sensitive(name) ||
          /\.(app|photoslibrary|backup|sparsebundle|bundle)$/i.test(name) ||
          (name.startsWith('.') && name !== '.next'),
      )
    )
      throw new HttpError(400, 'Esta pasta está protegida contra limpeza.', 'cleanup_path');
    try {
      await this.parents(path.join(root, '_'));
    } catch {
      throw new HttpError(
        400,
        'Escolha uma pasta existente, sem links, pertencente a você e sem escrita para outros usuários.',
        'cleanup_path',
      );
    }
    if (this.scanning || this.executing)
      throw new HttpError(429, 'Já existe uma análise ou limpeza em andamento.', 'cleanup_busy');
    this.scanning = true;
    try {
      const plan: CleanupPlan = {
        id: randomUUID(),
        root,
        expiresAt: this.now() + 10 * 60_000,
        files: [],
        warnings: [],
        partial: false,
      };
      const snapshots = new Map<string, Snapshot>();
      const parentStats = new Map<string, Stats>();
      const maxEntries = Math.max(60_000, maxFiles * 6);
      const rootDevice = (await fs.lstat(root)).dev;
      if (rootDevice !== (await fs.lstat(this.home)).dev)
        throw new HttpError(400, 'Escolha uma pasta no mesmo volume do seu diretório pessoal.', 'cleanup_path');
      const start = this.now();
      let visited = 0;
      const warn = (message: string) => {
        plan.partial = true;
        if (plan.warnings.length < 50) plan.warnings.push(message);
      };
      const walk = async (dir: string, cache: boolean, depth: number): Promise<void> => {
        if (signal?.aborted) throw new HttpError(499, 'Análise cancelada.', 'cleanup_cancelled');
        if (visited >= maxEntries || plan.files.length >= maxFiles || this.now() - start > 120_000 || depth > 30) {
          warn('Limite da análise atingido. Analise uma subpasta para obter uma prévia completa.');
          return;
        }
        let entries;
        try {
          const stat = await fs.lstat(dir);
          if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== rootDevice) {
            warn(`Pasta ou volume ignorado: ${dir}`);
            return;
          }
          entries = await fs.opendir(dir);
        } catch {
          warn(`Sem acesso: ${dir}`);
          return;
        }
        const project = await fs
          .lstat(path.join(dir, 'package.json'))
          .then((stat) => stat.isFile())
          .catch(() => false);
        for await (const entry of entries) {
          if (++visited > maxEntries || plan.files.length >= maxFiles || this.now() - start > 120_000) {
            warn('Limite da análise atingido. Analise uma subpasta.');
            break;
          }
          const file = path.join(dir, entry.name);
          if (signal?.aborted) throw new HttpError(499, 'Análise cancelada.', 'cleanup_cancelled');
          if (
            entry.isSymbolicLink() ||
            PROTECTED.has(entry.name) ||
            sensitive(entry.name) ||
            /\.(app|photoslibrary|backup|sparsebundle|bundle)$/i.test(entry.name) ||
            within(this.dataDir, file) ||
            entry.name.startsWith('.macpit-cleanup-')
          )
            continue;
          try {
            const stat = await fs.lstat(file);
            if (stat.isSymbolicLink()) continue;
            if (stat.dev !== rootDevice) {
              warn(`Outro volume ignorado: ${file}`);
              continue;
            }
            if (stat.isDirectory()) {
              if (cache) await walk(file, true, depth + 1);
              else if (project && entry.name === 'node_modules') {
                for (const name of ['.vite', '.cache']) {
                  const target = path.join(file, name);
                  try {
                    await this.parents(path.join(target, '_'));
                    await walk(target, true, depth + 1);
                  } catch (error) {
                    if (error instanceof HttpError) throw error;
                    /* Cache ausente ou link: não seguir. */
                  }
                }
              } else if (project && entry.name === '.next') {
                const target = path.join(file, 'cache');
                try {
                  await this.parents(path.join(target, '_'));
                  await walk(target, true, depth + 1);
                } catch (error) {
                  if (error instanceof HttpError) throw error;
                  /* Cache ausente ou link: não seguir. */
                }
              } else if (!entry.name.startsWith('.') && entry.name !== 'node_modules')
                await walk(file, false, depth + 1);
            } else if (
              stat.isFile() &&
              stat.uid === this.uid &&
              stat.nlink === 1 &&
              (stat.mode & 0o022) === 0 &&
              !entry.name.startsWith('.')
            ) {
              if (stat.size < minFileBytes) continue;
              const download = within(path.join(this.home, 'Downloads'), file);
              if (
                !cache &&
                !(download && (stat.size >= 100 * 1024 ** 2 || this.now() - stat.mtimeMs >= 30 * 86_400_000))
              )
                continue;
              const item: CleanupFile = {
                id: randomUUID(),
                path: file,
                bytes: stat.size,
                modifiedAt: stat.mtimeMs,
                category: cache ? 'cache' : 'manual',
                reason: cache
                  ? 'Cache reconhecido de ferramenta de desenvolvimento.'
                  : 'Download com mais de 30 dias ou pelo menos 100 MB; exige revisão manual.',
                impact: cache
                  ? 'A próxima execução pode reconstruir o cache e demorar mais. Confira o conteúdo antes de selecionar.'
                  : 'Pode ser um arquivo importante. Idade e tamanho não significam que pode ser descartado.',
              };
              snapshots.set(item.id, { file: item, stat, parents: await this.parents(file, parentStats) });
              plan.files.push(item);
            }
          } catch (error) {
            if (error instanceof HttpError) throw error;
            warn(`Não foi possível analisar: ${file}`);
          }
        }
      };
      await walk(root, false, 0);
      if (signal?.aborted) throw new HttpError(499, 'Análise cancelada.', 'cleanup_cancelled');
      plan.files.sort((a, b) => b.bytes - a.bytes);
      this.prune();
      while (
        this.plans.size >= 4 ||
        [...this.plans.values()].reduce((total, stored) => total + stored.snapshots.size, 0) + snapshots.size >
          CLEANUP_MAX_FILES
      )
        this.plans.delete(this.plans.keys().next().value!);
      this.plans.set(plan.id, { public: plan, snapshots });
      return plan;
    } finally {
      this.scanning = false;
    }
  }
  async open(planId: string, fileId: string) {
    const snapshot = this.get(planId).snapshots.get(fileId);
    if (!snapshot) throw new HttpError(400, 'Arquivo fora da prévia.', 'cleanup_selection');
    try {
      await this.validate(snapshot);
    } catch {
      throw new HttpError(409, 'O arquivo mudou desde a prévia. Analise novamente.', 'cleanup_changed');
    }
    await (
      this.deps.open ??
      (async (file) => {
        await run('open', ['-R', file]);
      })
    )(snapshot.file.path);
  }
  async execute(planId: string, ids: string[]): Promise<CleanupResult> {
    if (this.uid === 0) throw new HttpError(403, 'Limpeza indisponível como root.', 'cleanup_root');
    if (this.executing || this.scanning) throw new HttpError(409, 'Limpeza ou análise em andamento.', 'cleanup_busy');
    const plan = this.get(planId);
    const selected = ids.map((id) => plan.snapshots.get(id));
    if (selected.some((s) => !s) || new Set(ids).size !== ids.length)
      throw new HttpError(400, 'Seleção inválida.', 'cleanup_selection');
    // Consumo antes do primeiro await: replay e requisições concorrentes não repetem a operação.
    this.plans.delete(planId);
    this.executing = true;
    const result: CleanupResult = { items: [], movedBytes: 0 };
    const started = this.now();
    const inUse =
      this.deps.inUse ??
      (async (file: string) => {
        const response = await run('lsof', ['-F', 'p', '--', file], { okExitCodes: [0, 1], timeoutMs: 5_000 });
        if (response.stderr.trim()) throw new Error('Não foi possível conferir arquivos em uso.');
        return response.stdout.trim().length > 0;
      });
    try {
      this.audit('cleanup', planId, { phase: 'start', count: selected.length });
      for (const snapshot of selected as Snapshot[]) {
        const item = {
          id: snapshot.file.id,
          path: snapshot.file.path,
          status: 'skipped' as 'moved' | 'skipped' | 'failed',
          message: '',
        };
        let staging: string | undefined;
        let staged: string | undefined;
        try {
          if (this.now() - started > 120_000)
            throw new Error('Limite de tempo atingido. Analise novamente os itens restantes.');
          await this.validate(snapshot);
          if (await inUse(item.path)) throw new Error('Arquivo em uso; feche o aplicativo e analise novamente.');
          await this.validate(snapshot);
          staging = await fs.mkdtemp(path.join(path.dirname(item.path), '.macpit-cleanup-'));
          await fs.chmod(staging, 0o700);
          await fs.writeFile(path.join(staging, 'recuperacao.json'), JSON.stringify({ originalPath: item.path }), {
            mode: 0o600,
            flag: 'wx',
          });
          const contents = path.join(staging, 'arquivos');
          await fs.mkdir(contents, { mode: 0o700 });
          const destination = path.join(contents, path.basename(item.path));
          await this.validate(snapshot);
          await fs.rename(item.path, destination);
          staged = destination;
          await this.validate(snapshot, staged);
          if (await inUse(staged)) throw new Error('Arquivo em uso após a conferência.');
          item.status = 'failed';
          await (
            this.deps.trash ??
            (async (file) => {
              await run('osascript', ['-e', TRASH_SCRIPT, file], { timeoutMs: 15_000 });
            })
          )(staged);
          try {
            await fs.lstat(staged);
            throw new Error('O arquivo continua no local temporário.');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          item.status = 'moved';
          item.message = 'Enviado à Lixeira. Recupere manualmente pelo Finder para o caminho exibido.';
          result.movedBytes += snapshot.file.bytes;
        } catch (error) {
          item.message =
            error instanceof Error && !(error as { file?: string }).file
              ? error.message
              : 'Não foi possível enviar à Lixeira. Confira as permissões de Automação do macOS.';
          if (staged) {
            // link falha se o original reapareceu; jamais sobrescrever um arquivo novo.
            try {
              await fs.link(staged, item.path);
              await fs.unlink(staged);
            } catch (restoreError) {
              if ((restoreError as NodeJS.ErrnoException).code !== 'ENOENT') {
                item.status = 'failed';
                item.message += ` Arquivo preservado em ${staged}; recuperação manual necessária.`;
              } else item.message += ' Confira a Lixeira: o resultado da operação não pôde ser confirmado.';
            }
          }
        } finally {
          if (staging) {
            try {
              try {
                await fs.rmdir(path.join(staging, 'arquivos'));
              } catch {
                /* Pasta com arquivo preservado não é removida. */
              }
              const entries = await fs.readdir(staging);
              if (entries.length === 1 && entries[0] === 'recuperacao.json') {
                await fs.unlink(path.join(staging, 'recuperacao.json'));
                await fs.rmdir(staging);
              }
            } catch {
              /* Preservar resíduos e instruções em caso de falha. */
            }
          }
        }
        result.items.push(item);
      }
      this.audit('cleanup', planId, {
        phase: 'finish',
        moved: result.items.filter((i) => i.status === 'moved').length,
        movedBytes: result.movedBytes,
        skipped: result.items.filter((i) => i.status === 'skipped').length,
        failed: result.items.filter((i) => i.status === 'failed').length,
      });
      return result;
    } finally {
      this.executing = false;
    }
  }
}

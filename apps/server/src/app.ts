import os from 'node:os';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { Channels } from '@macpit/shared';
import type { Config } from './config/index.js';
import { openDb, type Db } from './db/index.js';
import { SettingsStore } from './db/settings.js';
import type { ShellImportDeps } from './modules/actions/shellImport.js';
import { Notifier, osascriptNotify, type SendNotification } from './modules/notify/notifier.js';
import { notifyRoutes } from './modules/notify/routes.js';
import { ServiceSupervisor, type SupervisorDeps, type SupervisorOptions } from './modules/services/supervisor.js';
import { createAudit, type Audit } from './lib/audit.js';
import { HttpError, sendError } from './lib/http.js';
import { registerSecurity } from './lib/security.js';
import { actionRoutes } from './modules/actions/routes.js';
import { ActionStore } from './modules/actions/store.js';
import { diskRoutes } from './modules/disk/routes.js';
import { DiskService, type DiskDeps } from './modules/disk/service.js';
import { DiskUsageService, type DuDeps } from './modules/disk/usage.js';
import { TailService } from './modules/logs/tail.js';
import { portRoutes } from './modules/ports/routes.js';
import { PortService, type PortDeps } from './modules/ports/service.js';
import { processRoutes } from './modules/processes/routes.js';
import { repoRoutes } from './modules/repos/routes.js';
import { RepoService } from './modules/repos/service.js';
import { ProcessService, type ProcessDeps } from './modules/processes/service.js';
import { defaultKillGroup, groupAlive, loadPtySpawn, RunManager, type RunDeps } from './modules/runs/manager.js';
import { RunStore } from './modules/runs/store.js';
import { createHealth } from './modules/system/health.js';
import { systemRoutes } from './modules/system/routes.js';
import { SystemService, type SystemDeps } from './modules/system/service.js';
import { registerStatic } from './static.js';
import { polled, WsHub } from './ws/hub.js';
import { wsRoutes } from './ws/routes.js';

export interface BuildOptions {
  logger?: FastifyServerOptions['logger'];
  /** Substitui os coletores do sistema (testes). */
  systemDeps?: SystemDeps;
  processDeps?: ProcessDeps;
  portDeps?: PortDeps;
  diskDeps?: DiskDeps;
  duDeps?: DuDeps;
  /** Substitui o pty/kill das execuções (testes). */
  runDeps?: Partial<RunDeps>;
  audit?: Audit;
  /** Banco já aberto (testes usam `:memory:`); padrão `<dataDir>/db.sqlite`. */
  db?: Db;
  /** Amostragem de disco em segundo plano. Padrão: ligada, exceto com NODE_ENV=test. */
  diskSampling?: boolean;
  supervisorDeps?: SupervisorDeps;
  supervisorOptions?: Partial<SupervisorOptions>;
  /** Envio de notificações (testes: um espião; padrão: osascript, desligado com NODE_ENV=test). */
  notify?: SendNotification;
  shellImport?: () => ShellImportDeps;
  /** Iniciar serviços com `autoStart` no boot. Padrão: sim, exceto com NODE_ENV=test. */
  autoStartServices?: boolean;
}

export async function buildApp(config: Config, token: string, opts: BuildOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: false, bodyLimit: 1024 * 1024 });

  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });
  registerSecurity(app, config, token);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return sendError(reply, err);
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error({ err }, 'erro não tratado');
    return reply.code(500).send({ error: 'erro interno' });
  });

  // Persistência e auditoria primeiro: os demais serviços dependem delas.
  const db = opts.db ?? openDb(path.join(config.dataDir, 'db.sqlite'));
  const audit = opts.audit ?? createAudit(db);

  const hub = new WsHub(app.log);
  const health = createHealth(config);
  const system = new SystemService(opts.systemDeps);
  const processes = new ProcessService(opts.processDeps, audit);
  const tails = new TailService(
    async (pid, path) => (await processes.openFiles(pid)).some((f) => f.tailable && f.name === path),
    audit,
  );
  const ports = new PortService(processes, config.sampleIntervalMs, opts.portDeps);
  const notifier = new Notifier(
    new SettingsStore(db),
    opts.notify ?? (config.env === 'test' ? async () => {} : osascriptNotify),
    (err) => app.log.warn({ err }, 'falha ao enviar notificação'),
  );
  const disk = new DiskService(db, config.diskSampleIntervalMs, opts.diskDeps);
  const usage = new DiskUsageService(opts.duDeps);
  if (opts.diskSampling ?? config.env !== 'test') {
    disk.startSampling(
      (err) => app.log.warn({ err }, 'falha ao gravar amostra de disco'),
      (volumes) => notifier.diskVolumes(volumes),
    );
  }

  const runs = new RunStore(db);
  const actions = new ActionStore(db, runs);
  const manager = new RunManager(
    runs,
    {
      spawn: opts.runDeps?.spawn ?? (await loadPtySpawn()),
      killGroup: opts.runDeps?.killGroup ?? defaultKillGroup,
      isAlive: opts.runDeps?.isAlive ?? groupAlive,
      now: opts.runDeps?.now ?? Date.now,
      home: opts.runDeps?.home ?? os.homedir,
    },
    { shell: config.shell, logsDir: path.join(config.dataDir, 'runs') },
    audit,
  );
  const repos = new RepoService(db, new SettingsStore(db), opts.runDeps?.home ?? os.homedir, audit);
  // Serviços com parâmetro `repo` iniciados no boot precisam da lista de repositórios.
  if (repos.settings().roots.length > 0)
    await repos.scan().catch((err) => app.log.warn({ err }, 'falha ao varrer repositórios'));
  manager.setPrepare((action, values) => repos.resolve(action, values));
  const { count: interrupted, survivors } = manager.recoverInterrupted();
  if (interrupted > 0) app.log.warn({ interrupted }, 'execuções marcadas como interrompidas (servidor reiniciado)');
  for (const s of survivors) {
    // Não mata sozinho (o pid pode ter sido reutilizado); o usuário decide pela página de Processos.
    process.stderr.write(
      `  ⚠️  A ação "${s.actionName}" (PID ${s.pid}) ainda parece estar rodando da sessão anterior. ` +
        `Veja em /processes?pid=${s.pid}\n`,
    );
  }
  const supervisor = new ServiceSupervisor(manager, actions, opts.supervisorDeps, opts.supervisorOptions, (e) =>
    notifier.serviceEvent(e),
  );
  supervisor.startChecks();
  if (opts.autoStartServices ?? config.env !== 'test') {
    const { started, failed } = supervisor.autoStartAll();
    if (started.length) process.stdout.write(`  ▶ Serviços iniciados: ${started.join(', ')}\n`);
    for (const f of failed) process.stderr.write(`  ⚠️  Não foi possível iniciar "${f.name}": ${f.error}\n`);
  }
  manager.onFinish((run) => notifier.runFinished(run, Boolean(run.actionId && actions.find(run.actionId)?.persistent)));

  hub.define(Channels.health, polled(health, config.sampleIntervalMs, app.log));
  hub.define(
    Channels.system,
    polled(() => system.sample(), config.sampleIntervalMs, app.log),
  );
  hub.define(
    Channels.processes,
    polled(() => processes.list(), config.sampleIntervalMs, app.log),
  );
  hub.define(
    Channels.ports,
    polled(() => ports.list(), config.sampleIntervalMs, app.log),
  );
  // df é barato, mas volume de disco muda devagar: no mínimo 5 s entre coletas ao vivo.
  hub.define(
    Channels.disk,
    polled(() => disk.overview(), Math.max(config.sampleIntervalMs, 5_000), app.log),
  );
  hub.resolve(tails.resolver);
  hub.resolve(manager.resolver);
  hub.onCommand('run:input', (msg) => (msg.type === 'run:input' ? manager.input(msg.runId, msg.data) : undefined));
  hub.onCommand('run:resize', (msg) =>
    msg.type === 'run:resize' ? manager.resize(msg.runId, msg.cols, msg.rows) : undefined,
  );

  systemRoutes(app, { health, system, sampleIntervalMs: config.sampleIntervalMs });
  processRoutes(app, { processes, tails, sampleIntervalMs: config.sampleIntervalMs });
  portRoutes(app, { ports });
  diskRoutes(app, { disk, usage });
  actionRoutes(app, {
    actions,
    runs,
    manager,
    supervisor,
    repos,
    ...(opts.shellImport ? { shellImport: opts.shellImport } : {}),
  });
  notifyRoutes(app, { notifier });
  repoRoutes(app, { repos, actions, runs, manager, processes, ports });
  wsRoutes(app, hub);
  await registerStatic(app, config);

  app.addHook('onClose', async () => {
    supervisor.close(); // antes do shutdown: evita reinício automático durante o desligamento
    await manager.shutdown();
    hub.close();
    tails.close();
    disk.stopSampling();
    if (!opts.db) db.close();
  });
  return {
    app,
    hub,
    system,
    processes,
    tails,
    ports,
    disk,
    usage,
    db,
    actions,
    runs,
    manager,
    supervisor,
    notifier,
    repos,
  };
}

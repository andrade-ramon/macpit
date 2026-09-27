import { buildApp } from './app.js';
import { loadConfig, migrateLegacyDataDir } from './config/index.js';
import { loadOrCreateToken } from './lib/auth.js';
import { isRootUser } from './modules/system/health.js';

async function main() {
  const config = loadConfig();
  if (migrateLegacyDataDir(config.dataDir) === 'moved') {
    process.stdout.write(
      `  ↪ Dados movidos de ~/.bash-monitor para ${config.dataDir} (o nome antigo virou um link).\n`,
    );
  }
  const token = loadOrCreateToken(config.dataDir);
  const { app } = await buildApp(config, token, {
    logger: { level: config.env === 'development' ? 'info' : 'warn' },
  });

  await app.listen({ host: config.host, port: config.port });

  const base = config.webDevUrl ?? `http://${config.host}:${config.port}`;
  const lines = [
    '',
    `  macpit rodando em http://${config.host}:${config.port}`,
    `  Abra: ${base}/auth?token=${token}`,
    `  Dados: ${config.dataDir}`,
  ];
  if (isRootUser()) lines.push('  ⚠️  ROOT — todos os comandos executarão como root.');
  process.stdout.write(lines.join('\n') + '\n\n');

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'encerrando');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

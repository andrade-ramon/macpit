import { buildApp } from './app.js';
import { loadConfig, migrateLegacyDataDir } from './config/index.js';
import { loadOrCreateToken } from './lib/auth.js';
import { isRootUser } from './modules/system/health.js';
import fs from 'node:fs';

async function main() {
  const config = loadConfig();
  if (migrateLegacyDataDir(config.dataDir) === 'moved') {
    process.stdout.write(
      `  ↪ Dados movidos de ~/.bash-monitor para ${config.dataDir} (o nome antigo virou um link).\n`,
    );
  }
  const token = loadOrCreateToken(config.dataDir);
  const execve = process.execve;
  const executable = process.execPath;
  const args = [executable, ...process.execArgv, ...process.argv.slice(1)];
  const env = { ...process.env };
  let closing: Promise<void> | undefined;
  const { app } = await buildApp(config, token, {
    logger: { level: config.env === 'development' ? 'info' : 'warn' },
    ...(execve && config.env !== 'development'
      ? {
          restart: {
            prepare: () => {
              fs.accessSync(executable, fs.constants.X_OK);
              fs.accessSync(process.argv[1]!, fs.constants.R_OK);
            },
            restart: async (): Promise<void> => {
              closing ??= app.close();
              await closing;
              try {
                // Mantém PID, stdio, usuário e supervisão do launchd; carrega novamente todo o código.
                execve(executable, args, env);
              } catch {
                // O app já está fechado. O LaunchAgent pode recuperar a saída não zero.
                process.stderr.write('Não foi possível recarregar o macpit; inicie o servidor novamente.\n');
                process.exit(1);
              }
            },
          },
        }
      : {}),
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
    closing ??= app.close();
    await closing;
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

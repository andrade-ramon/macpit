// Prepara o diretório de dados do E2E e SÓ ENTÃO o webServer sobe (é o 1º passo do comando dele).
// Não use globalSetup para isso: o Playwright inicia o webServer ANTES do globalSetup, e apagar o
// diretório ali removia o banco e os logs com o servidor já rodando.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.tmpdir(), 'macpit-e2e');
const token = 'e2e' + '0'.repeat(61); // igual a E2E_TOKEN em e2e/env.ts
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(dir, 'token'), token + '\n', { mode: 0o600 });

// Repositórios sintéticos (só os arquivos de .git que o macpit lê) para o teste de Repositórios.
for (const [name, remote] of [
  ['loja', 'git@github.com:acme/loja.git'],
  ['rascunho', null],
]) {
  const git = path.join(dir, 'projetos', name, '.git');
  fs.mkdirSync(git, { recursive: true });
  fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(git, 'config'), remote ? `[remote "origin"]\n\turl = ${remote}\n` : '[core]\n');
}

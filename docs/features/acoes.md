# Ações (fase 5)

Status: **implementado**. Comandos salvos que você executa com um clique e acompanha num terminal ao vivo, por exemplo o túnel SSH com o banco de um projeto.

Execuções com parâmetro de repositório guardam o projeto escolhido em `Run.repoPath` e aparecem no [painel por projeto](projetos.md), junto das portas de suas execuções ativas. O terminal e o log continuam no rodapé compartilhado.

## Modelo

Uma ação tem:

- nome, ícone (emoji) e grupo;
- **comando**: qualquer coisa que funcionaria no seu terminal (script, alias, pipeline);
- diretório de trabalho (absoluto ou `~`, padrão: home);
- variáveis de ambiente;
- opção "favorita".

Detalhes em [06-modelo-dados.md](../06-modelo-dados.md).

## Execução (`apps/server/src/modules/runs/manager.ts`)

- **Comando:** `MACPIT_SHELL -lc "<comando>"` (padrão `/bin/bash`) dentro de um pseudo-terminal (**node-pty**, `xterm-256color`).
  - O `-l` (shell de login) carrega `~/.bash_profile`, PATH, `ssh-agent` etc.
  - Este é o **único** ponto do sistema em que um comando passa por um shell (AGENTS.md, regra 3).
- **Ambiente:** o do servidor, mais as variáveis da ação, mais `TERM`, `COLORTERM`, `MACPIT_RUN_ID` e `MACPIT_ACTION_ID`.
- **Usuário:** o mesmo que iniciou o servidor. Com `sudo ./scripts/start.sh`, a ação roda como root, e o editor mostra isso em vermelho.
- **Saída:**
  - vai para um buffer de 256 KB (usado no replay), para o arquivo `runs/<id>.log` (0600, até 20 MB) e para os inscritos do canal `run:<id>`;
  - é enviada em lotes de 10 ms. O replay **não inclui** o lote pendente, senão quem abre o terminal nesse intervalo veria o texto duplicado (há teste para isso).
- **Interação:** as teclas digitadas no xterm vão como `run:input` e são escritas no pty. Por isso funcionam prompts de senha do ssh, `read`, confirmações `y/n` etc. O redimensionamento vai como `run:resize`.
- **Parar:**
  - envia SIGTERM ao **grupo de processos**. O pty é líder de sessão, então isso alcança os filhos, como o `ssh` de um script de túnel;
  - se a execução não terminar em 5 s, envia SIGKILL;
  - o status vira `killed`, com o sinal registrado.
- **Fim:** código 0 dá `exited`; qualquer outro código, ou um sinal que ninguém pediu, dá `failed`.
- **Desligar o servidor** (Ctrl+C / SIGTERM): todas as execuções em andamento recebem SIGTERM e ficam como `killed`.
- **Servidor caiu:** no próximo boot, as execuções que estavam `running` viram `interrupted`.
- **Retenção:** ficam as 50 execuções mais recentes por ação; as mais antigas são apagadas junto com o log.
- **Auditoria:** `run` (comando e cwd) e `stop` vão para `audit_log`.
- **Ambiente de desenvolvimento:** o node-pty publica o `spawn-helper` do macOS sem permissão de execução. O `postinstall` (`scripts/fix-node-pty.mjs`) corrige isso; sem ele, todo `spawn` falha com `posix_spawnp failed`.

## UI (`/actions`, carregada sob demanda por causa do xterm.js)

- **Cards:**
  - organizados em Favoritas, depois por grupo, depois "Sem grupo";
  - mostram o comando e o cwd;
  - com a execução parada: resultado da última (clicável) e o botão **▶ Executar**;
  - rodando: indicador pulsante, **Terminal** e **Parar**.
- **Editor** (`?edit=<id>|new`):
  - campos de ícone, nome, comando (monoespaçado), diretório, grupo (com sugestões) e variáveis (validando o nome), mais a opção de favorita;
  - informa com qual usuário o comando vai rodar;
  - remover pede confirmação e mantém o histórico.
- **Painel de terminal** (`?run=<id>`):
  - xterm.js ajustado ao tamanho do painel, com status, início, duração ao vivo e PID;
  - **Parar**, **Executar de novo** e **Baixar log**;
  - funciona também para execuções já terminadas (mostra o log);
  - se o WebSocket reconectar, o replay redesenha o terminal.
- **Execuções recentes:** as últimas 15, de todas as ações.
- O indicador "conectado" da barra lateral agora abre a conexão WS em qualquer página. Antes, páginas sem canal ao vivo mostravam "desconectado".

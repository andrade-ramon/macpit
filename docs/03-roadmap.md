# Roadmap

Cada fase é entregável e testável sozinha. Marque `[x]` ao concluir (no mesmo PR).

## Fase 0 — Fundação

- [x] Workspace pnpm com `apps/server`, `apps/web`, `packages/shared` (package.json, tsconfig, scripts)
- [x] Vitest + ESLint + Prettier configurados em todos os pacotes
- [x] Server Fastify em 127.0.0.1 com `/api/health`; config via env (`MACPIT_*`) com zod
- [x] Auth: token aleatório gerado em `~/.macpit/token`, URL de acesso impressa no boot; cookie httpOnly; checagem Origin/Host
- [x] `lib/exec.ts`: wrapper `execFile` com timeout e limite de buffer
- [x] Web: Vite + React + Tailwind + TanStack Query + router; layout com sidebar e banner quando `isRoot`
- [x] WebSocket hub com subscribe/unsubscribe e autenticação no upgrade
- [x] Server serve `apps/web/dist` em produção; `scripts/start.sh` funcionando

## Fase 1 — Visão geral do sistema

- [x] `modules/system`: CPU total, load average, memória (vm_stat + sysctl hw.memsize), uptime, hostname, usuário atual
- [x] Página Home com cards e mini-gráficos (últimos 5 min em memória)

## Fase 2 — Processos

- [x] Parser de `ps` em duas chamadas (`pid,ppid,uid,user,%cpu,%mem,rss,vsz,state,etime,comm` + `pid,args`), fixtures sintéticas + testes
- [x] Canal `processes` com snapshot periódico
- [x] Tabela virtualizada: busca, ordenação, filtro por usuário, visão em árvore
- [x] `POST /api/processes/:pid/kill` (sinal TERM/KILL/INT/HUP), PIDs protegidos, confirmação na UI
- [x] Detalhe: `lsof -p` (arquivos/conexões), árvore de filhos
- [x] Tail ao vivo de arquivos de log abertos pelo processo (`modules/logs`, canal `tail:<id>`)

## Fase 3 — Portas

- [x] Parser de `lsof -nP -w +c 0 -iTCP -sTCP:LISTEN -iUDP -F pcuLftPnT` (fixture sintética + testes)
- [x] Página Portas: porta, proto, endereço, PID, processo, usuário; busca por porta
- [x] Encerrar dono da porta; link para o detalhe do processo
- [x] Extras: canal `ports` ao vivo, selo local/rede, filtros de protocolo/escopo, botão "Abrir" (TCP)

## Fase 4 — Disco

- [x] Parser de `df -kP` (filtrar volumes de sistema irrelevantes, APFS)
- [x] Amostragem periódica gravada no SQLite (`disk_samples`, retenção 30 dias)
- [x] Página Disco: barras por volume, gráfico histórico, limite de alerta configurável
- [x] Explorador "maiores pastas" (`du -xk -d 1 <path>`) sob demanda, navegável
- [x] Extras: camada `db/` (node:sqlite + migrations + settings), canal `disk`, card de disco na Home

## Fase 5 — Ações (núcleo)

- [x] SQLite: tabelas `actions`, `runs` + migrations (migration 2, com `audit_log`)
- [x] CRUD `/api/actions` com schema zod (nome, comando, cwd, env, grupo, ícone, favorito)
- [x] Executor `modules/runs`: node-pty com `MACPIT_SHELL -lc "<comando>"`, log em `~/.macpit/runs/<id>.log`, exit code
- [x] Canal `run:<id>`: output, input (stdin), resize, status; replay do buffer ao reconectar
- [x] UI: grade de ações por grupo, editor, botão executar, terminal xterm.js, parar (TERM → KILL)
- [x] Histórico de execuções com visualização do log e duração
- [x] Extras: auditoria no SQLite, parar mata o grupo de processos (filhos/túneis), execuções órfãs viram `interrupted` no boot, retenção de 50 execuções por ação

## Fase 6 — Ações avançadas

- [x] Ações persistentes ("serviços"): status, porta esperada + health-check, auto-restart opcional
- [x] Parâmetros `{{var}}` com formulário (valores padrão, escape seguro via variáveis de ambiente)
- [x] Importar aliases/funções do shell; exportar/importar JSON
- [x] Paleta ⌘K; notificações do macOS
- [x] Extras: página Configurações, card de Serviços na Home, busca de Processos/Portas na URL (`?q=`), parâmetros secretos

## Fase 7 — Polimento

- [x] Tema claro/escuro, atalhos de teclado, estados vazios/erros
- [x] Opcional: LaunchAgent para iniciar com o login (`scripts/install-launchagent.sh`)
- [x] Testes E2E (Playwright) dos fluxos principais
- [x] Extras: serviços "iniciar junto com o macpit" (`autoStart`), `scripts/open.sh`, aviso de servidor desconectado, ErrorBoundary por página

## Fase 8 — App instalável (PWA)

- [x] Manifest, ícones (incl. maskable e apple-touch) gerados por script, meta tags
- [x] Service worker só com a casca (API/WS/auth nunca em cache), atualização com recarga automática
- [x] Tela "servidor parado" com nova tentativa automática; sessão deslizante; login colando o token (`POST /auth`)
- [x] Botão "Instalar app" (Chrome/Edge) e instruções (Safari); E2E de instalabilidade e offline

## Extra — Repositórios

- [x] Pastas de projetos configuráveis, detecção de repositórios git/GitHub sem executar `git`
- [x] Variáveis por repositório (com segredos que não voltam para o navegador)
- [x] Parâmetro de ação do tipo `repo`: escolhe o repo, roda na pasta dele e preenche parâmetros com as variáveis

## Extra — Redesign "Cockpit"

- [x] Interface do Claude Design: cabeçalho com navegação em pílulas, área de 3 colunas (filtros · conteúdo · detalhes), terminal com abas no rodapé
- [x] 3 paletas (Carbono, Grafite quente, Meia-noite) + densidade das tabelas; fontes empacotadas
- [x] Todas as páginas redesenhadas; parâmetros de ação preenchidos nos detalhes; gráficos em SVG próprio (sem Recharts)

## Próximos passos (ideias, fora do plano original)

- CLI instalável (`npm i -g` / Homebrew) com `start|stop|status|open|service|doctor` e assistente de primeira execução

- Containers Docker e `brew services` como fontes de processos/serviços
- Tempo de CPU por processo ao longo do tempo (histórico por PID)
- Agendar ações (cron) com histórico
- Empacotar como binário único (ex.: Node SEA) para instalar sem pnpm

# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Unreleased]

### Changed

- **Criar com IA:** esclarecimentos agora têm um campo por pergunta, etapas com Voltar/Próxima, revisão e edição das respostas antes do envio conjunto. Navegação não chama o provedor; respostas são preservadas em falhas e cancelamento.

- **Painel por projeto:** ações e serviços organizados em cards numa grade responsiva, com botões na base de cada bloco.

- **Painel por projeto:** acesso pela página Repositórios, ações e serviços contextualizados, portas das execuções ativas e seus filhos, histórico com terminal/log no rodapé e atualização periódica. Migration 6 registra o repositório de cada nova execução; serviços ativos em outro projeto são bloqueados, inclusive durante reinício pendente, e a parada confere o projeto esperado. Inclui testes de migração, API, isolamento e E2E no Chrome.

- **Projeto renomeado: bash-monitor → macpit** (repositório `andrade-ramon/macpit`). Pacotes `@macpit/*`, variáveis `MACPIT_*`, diretório `~/.macpit`, LaunchAgent `com.macpit.server`, cookie `macpit_session`, pasta do design em `docs/design/`. Compatibilidade com instalações antigas:
  - `~/.bash-monitor` é movido para `~/.macpit` no primeiro boot (fica um link no lugar antigo);
  - `BM_*` continua valendo na configuração; as ações ainda recebem `BM_REPO_*`, `BM_RUN_ID` e `BM_ACTION_ID`;
  - o cookie `bm_session` e as preferências `bm-*` do navegador ainda são aceitos;
  - exportações `bash-monitor/actions` podem ser importadas; o LaunchAgent `com.bash-monitor.server` é removido ao instalar o novo.

### Added

- **Criar ações com IA:** configuração de Gemini/Anthropic e API key em memória ou arquivo 0600; geração com esclarecimentos/refinamento, validação de templates e revisão no editor existente. Criar não executa, automações ficam desligadas e credenciais não vão para o ambiente dos comandos. Inclui limites, cancelamento, auditoria sem conteúdo, testes de segurança/API e E2E com respostas simuladas.

- **Reiniciar macpit:** botão nas Configurações com confirmação e contagem de execuções ativas, fechamento ordenado, recarga do processo pelo mesmo Node e reconexão automática por `instanceId`. Preserva dados e sessão; não reinicia o macOS. Rotas `/api/server` e `/api/server/restart`, auditoria e E2E de reinício real do servidor de teste.

- **Painéis salvos:** botão Salvar painel nos projetos e aba Painéis com busca, abertura da visão ao vivo, URL persistente, indicação de repositório indisponível e remoção confirmada. Persistência em `settings.panels.saved`, rotas `/api/panels`, atalho `g b`, entrada na paleta e testes de API/E2E; salvar ou abrir não inicia ações.

- **Agentes de IA (Claude Code e Codex):** regras num só `AGENTS.md` (o `CLAUDE.md` importa); roteiros compartilhados em `docs/agents/` (implementar funcionalidade, atualizar docs, revisão de segurança); comandos `/implement-feature`, `/update-docs`, `/security-review` no Claude Code; `scripts/install-codex-prompts.sh` instala os mesmos roteiros como prompts do Codex.
- **Open-source:** licença MIT, `SECURITY.md`, `CONTRIBUTING.md`, modelos de issue/PR e CI no GitHub Actions (macOS: typecheck, lint, format, testes, build e E2E). Dados de exemplo do design sem nomes internos; capturas de tela no README.
- **Ações:** parâmetro repositório sem padrão abre, ao executar, um popup com a lista dos repositórios (busca, setas, ↵); escolher executa. Vale para cards, Visão geral, paleta ⌘K e "Executar de novo" (`features/actions/RunLauncher.tsx`).
- **Redesign "Cockpit"** (design do Claude Design em `docs/design/`):
  - cabeçalho com navegação em pílulas e selos (disco em alerta, serviços sem resposta);
  - área de trabalho em 3 colunas (filtros · conteúdo · detalhes), com laterais recolhíveis abaixo de 1500px;
  - terminal fixo no rodapé com abas das execuções, redimensionável;
  - paleta ⌘K em grupos com ícones; 3 paletas de cores e densidade das tabelas; fontes Instrument Sans e JetBrains Mono empacotadas;
  - Visão geral com "Este Mac", "Atenção agora", serviços e favoritas;
  - detalhes de processo, porta, volume (com tendência e previsão), ação (parâmetros inline, duplicar) e repositório (variáveis inline, abrir pasta, executar aqui);
  - `POST /api/repos/:id/open`; ícones do app com a nova marca.

### Removed

- Tema claro (`theme-light.css`, `scripts/gen-theme-light.py`), barra lateral, `RunPanel`, `RunParamsDialog`, `Card`, `StackedBar` e a dependência Recharts.

- **Repositórios:**
  - pastas de projetos (ex.: `~/github`) com detecção automática de repositórios git e do remote GitHub, lendo `.git` sem executar `git`;
  - variáveis por repositório (inclusive secretas);
  - parâmetro de ação do tipo **repositório**: a ação roda na pasta do repo escolhido e os parâmetros de mesmo nome recebem as variáveis dele;
  - página Repositórios (`g r`), migration 5 (`repo_vars`) e E2E;
  - escolher quais repositórios importar (caixa por repo, ações em lote; novos entram desmarcados após a 1ª escolha);
  - paleta ⌘K: repositórios do GitHub ("abrir no GitHub ↗"; `gh` lista todos) e a página Repositórios.

- **Fase 8 — App instalável (PWA)**:
  - manifest com atalhos;
  - ícones 192/512/maskable/apple-touch gerados por `scripts/gen-icons.mjs`;
  - service worker que guarda só a casca (API, WS e auth nunca em cache), versionado por build e com recarga automática ao atualizar;
  - tela "servidor parado", que tenta de novo a cada 5 s;
  - sessão deslizante (cookie renovado em `/api/health`);
  - login colando o token (`POST /auth`);
  - botão "Instalar app" e seção em Configurações;
  - E2E de instalabilidade (DevTools), offline e login.

- Estrutura inicial do repositório, documentação, plano e configuração de agentes.
- **Fase 0 — Fundação**:
  - monorepo pnpm (server, web e shared);
  - servidor Fastify em 127.0.0.1, com configuração pelas variáveis `MACPIT_*` validada por zod;
  - autenticação por token (arquivo 0600, cookie HttpOnly/SameSite=Strict ou Bearer) e checagens de Host (421), Origin e cross-site (403);
  - `lib/exec` seguro, sem shell e com timeout;
  - hub WebSocket com canais sob demanda e canal `health`;
  - UI React com layout, banner ROOT, indicador de conexão e páginas planejadas;
  - o servidor entrega o build do web em produção;
  - Vitest, ESLint e Prettier.
- **Fase 1 — Visão geral do sistema**:
  - `modules/system` com:
    - CPU calculada pela diferença entre leituras de `os.cpus()`;
    - load average;
    - memória via `vm_stat`, no estilo do Monitor de Atividade;
    - swap via `sysctl vm.swapusage`;
    - uptime;
  - histórico de 5 min em memória;
  - `GET /api/system` e canal WS `system`;
  - Home com cards, sparklines e composição da memória;
  - `run()` aceita `env`.
- **Fase 2 — Processos**:
  - coleta com duas chamadas ao `ps` (stats + args), que aceita espaços em `comm` e `args`;
  - canal `processes`;
  - detalhe com pai, filhos e arquivos abertos (`lsof -F`);
  - sinais TERM/KILL/INT/HUP com PIDs protegidos e auditoria em `audit.log`;
  - tail ao vivo de arquivos abertos pelo processo (stdout/stderr redirecionados e logs), via `POST /api/tails` + canal `tail:<id>`;
  - UI: tabela virtualizada com busca, filtro por usuário, ordenação, visão em árvore e painel lateral (`?pid=`);
  - o hub remove canais dinâmicos sem inscritos;
  - error handler global com `HttpError`.
- **Fase 3 — Portas**:
  - `modules/ports`: um único `lsof -F` para TCP em LISTEN e UDP ligado a uma porta; IPv4 e IPv6 da mesma porta e PID aparecem agrupados;
  - escopo `local` (só loopback) ou `network` (acessível pela rede);
  - linha de comando completa, vinda do snapshot de processos;
  - `GET /api/ports` e canal `ports`;
  - UI com busca por prefixo de porta ou texto e filtros de protocolo e escopo;
  - botões "Abrir" (`http://localhost:<porta>`), "Processo" e "Encerrar" com confirmação (TERM ou KILL);
  - aviso quando o servidor roda sem root (o `lsof` só vê processos do próprio usuário).
- **Fase 4 — Disco**:
  - camada `db/` com `node:sqlite` (ADR 0002), migrations por `user_version` e `SettingsStore`;
  - `modules/disk`:
    - `df -kP`, filtrando os volumes internos do APFS, pseudo-filesystems e imagens de simulador;
    - usado = total − disponível, como o Finder;
    - amostragem em segundo plano no SQLite (`MACPIT_DISK_SAMPLE_INTERVAL_MS`, 5 min por padrão), com retenção de 30 dias;
    - histórico agregado em até ~300 pontos;
  - limite de alerta configurável (`PUT /api/disk/settings`);
  - explorador "maiores pastas" (`du -xk -d 1`), com cache de 10 min, `refresh`, pedidos simultâneos agrupados, no máximo 2 análises ao mesmo tempo e timeout de 120 s;
  - canal `disk`;
  - UI:
    - cards por volume com cor pelo limite e faixa de alerta;
    - gráfico Recharts de 24h/7d/30d com a linha do limite, numa página carregada sob demanda;
    - explorador com trilha de navegação, atalhos e "mostrar todas";
    - card de disco na Home.
- **Fase 5 — Ações**:
  - migration 2 (`actions`, `runs`, `audit_log`), com a auditoria saindo do arquivo para o SQLite;
  - CRUD `/api/actions`;
  - executor `RunManager` com node-pty (`MACPIT_SHELL -lc`), cobrindo:
    - buffer de replay e log 0600;
    - input e resize pelo WebSocket (`run:input`, `run:resize`);
    - parar com SIGTERM no grupo e SIGKILL após 5 s;
    - `interrupted` no boot, com aviso das execuções que ainda estão vivas;
    - SIGKILL no desligamento para quem ignora SIGTERM;
    - limite de 20 execuções simultâneas e retenção de 50 por ação;
  - canal `run:<id>` com `initial()` (replay por inscrito);
  - `/api/runs` (lista, detalhe, log, stop);
  - UI com xterm.js (página carregada sob demanda): cards por grupo e favoritas, editor com variáveis, painel de terminal interativo, execuções recentes;
  - `postinstall` que corrige a permissão do `spawn-helper` do node-pty.
- **Fase 6 — Ações avançadas**:
  - parâmetros `{{nome}}` (`shared/template.ts`):
    - o valor vai em variável de ambiente (`"${MACPIT_PARAM_X}"`), nunca colado no comando;
    - `{{x}}` em aspas simples é recusado; há parâmetros secretos;
    - formulário antes de executar e validação ao vivo no editor;
  - serviços:
    - health-check da porta esperada por `net.connect`;
    - estados `stopped`, `starting`, `up`, `unhealthy`, `running` e `restarting`;
    - reinício automático com backoff de 2 s a 60 s, reusando os parâmetros;
    - `POST /api/actions/:id/stop`;
  - notificações do macOS (`osascript` com argv) para execuções, serviços e disco, com a página **Configurações**;
  - importar aliases e funções do shell (zsh: só dos seus dotfiles; função vira `zsh -ic 'fn "$@"' _`);
  - exportar/importar JSON;
  - paleta ⌘K;
  - card de Serviços na Home;
  - busca de Processos e Portas na URL (`?q=`);
  - migration 3.
- **Fase 7 — Polimento**:
  - tema claro/escuro/sistema, com variáveis do Tailwind redefinidas e geradas por `scripts/gen-theme-light.py`, aplicado antes da primeira pintura;
  - atalhos `g`+tecla, `/`, `t` e `?`, com diálogo de atalhos;
  - ErrorBoundary por página e aviso de servidor desconectado;
  - estado vazio em Processos;
  - LaunchAgent (`scripts/install-launchagent.sh` com `--status`, `--uninstall` e `--print`) e `scripts/open.sh`;
  - serviços com `autoStart`, que sobem com o dashboard (migration 4);
  - testes E2E com Playwright usando o Chrome instalado (`pnpm e2e`, 7 fluxos);
  - README reescrito.

### Fixed

- Documentação das fases 0 e 1 que não tinha sido aplicada: API, CHANGELOG, CLAUDE.md, segurança, modelo de dados e índice. O Prettier alterava o texto antes das substituições automáticas, que falhavam sem erro.
- Indicador de conexão mostrava "desconectado" em páginas sem canal ao vivo (o WS só conectava ao assinar um canal); `useWsStatus()` agora abre a conexão.
- Servidor em produção servia `index.html` no lugar de chunks JS criados por um build posterior ao boot, deixando a página em branco. Agora usa `wildcard: true`, e asset inexistente dá 404.
- Terminal duplicava a saída que ainda estava no lote de 10 ms quando alguém assinava (o replay incluía o lote pendente).
- Achados do `security-reviewer`:
  - um subscribe de uma execução apagada derrubava o servidor;
  - erro no stream do log derrubava o processo;
  - processos que ignoram SIGTERM sobreviviam ao desligamento;
  - o fallback de `kill` por PID podia atingir um processo reutilizado;
  - não havia limite de execuções.
- Paleta ⌘K: "8811" + Enter **executava** uma ação favorita cujo comando continha as letras 8…8…1…1 em ordem. Agora ações só casam por trecho contínuo, e busca numérica vai sempre para Portas.
- Cards de ação estouravam a largura com o terminal aberto (item de grid sem `min-w-0`).
- Um `ZodError` lançado dentro do store de ações virava 500; agora é 400 com a mensagem.
- Achados do `security-reviewer` na fase 6:
  - injeção por contexto aritmético (`$(( {{n}} ))`, `[[ ]]`, `${…}`, `a[…]`, `let`), agora recusados, com teste de bash real;
  - a paleta executava com um único Enter, e agora pede confirmação;
  - o scanner não entendia comentários (`# don't`);
  - o supervisor não esquecia ações apagadas (`forget`).
- Fase 7:
  - o ciclo do tema (sistema → claro) parecia não fazer nada com o macOS no modo claro; `t` e o botão agora alternam a aparência;
  - o log do LaunchAgent, que recebe a URL com o token, seria criado com 0644; agora é criado com 0600;
  - grade e eixos do gráfico de disco ficavam escuros no tema claro.

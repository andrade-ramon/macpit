# AGENTS.md — instruções para agentes de IA

Fonte única das regras do projeto para **qualquer** agente: Codex lê este arquivo direto; Claude Code o importa pelo `CLAUDE.md` (que só acrescenta o que é específico dele). Mudou uma regra? Mude **aqui**.

## O projeto

**macpit**: cockpit local para o macOS — monitora processos, portas e disco e executa "ações" (comandos salvos) num terminal ao vivo, pelo navegador. Open-source (MIT), repositório `andrade-ramon/macpit`.
Leia antes de qualquer tarefa: `docs/02-arquitetura.md`, `docs/05-seguranca.md` e a página da funcionalidade em `docs/features/`. Documentação, interface e commits são em **português**.

## Stack

- Monorepo **pnpm** (Node 24, TypeScript estrito, ESM).
- `apps/server`: **Fastify** + `@fastify/websocket`, **node-pty** (terminal real para as ações), **`node:sqlite`** embutido no Node 24 (persistência, sem build nativo — ADR 0002), **zod** (validação).
- `apps/web`: **React + Vite + TypeScript**, TanStack Query/Virtual, Tailwind v4, **xterm.js** (terminal do rodapé, carregado sob demanda); gráficos em SVG próprio (`Sparkline`, `DiskHistoryChart`), sem biblioteca de gráficos. Fontes Instrument Sans + JetBrains Mono via `@fontsource` (nada de Google Fonts).
- `packages/shared`: tipos e schemas zod compartilhados entre server e web (fonte única de verdade dos contratos).

## Comandos

- `pnpm install` · `pnpm dev` · `pnpm build` · `pnpm test` · `pnpm e2e` · `pnpm lint` · `pnpm typecheck` · `pnpm format`
- Antes de concluir qualquer tarefa: `pnpm typecheck && pnpm lint && pnpm test` devem passar. Mudou fluxo de UI? Rode também `pnpm e2e` (Playwright com o Chrome instalado, viewport 1600×1000 — as 3 colunas visíveis; ver `docs/features/polimento.md`).
- E2E: dados do servidor são preparados no **comando do webServer** (`e2e/prepare-data.mjs`) — nunca no `playwright.config.ts` (reavaliado nos workers) nem no `globalSetup` (roda depois do webServer).
- PWA: o service worker é `apps/web/src/sw/sw.ts` → build gera `/sw.js` (tsconfig próprio `tsconfig.sw.json`). **Nunca** inclua `/api`, `/ws` ou `/auth` no cache — as regras ficam em `src/sw/routing.ts` (com testes). Ícones: `node scripts/gen-icons.mjs`. O SW só é registrado no build de produção (não afeta `pnpm dev`); navegadores embutidos de ferramentas de IA (ex.: o do Claude Desktop) não suportam SW — teste no Chrome (`pnpm e2e`).
- **Design:** a UI segue `docs/design/Redesign Cockpit.dc.html` (ver `docs/features/interface.md`). Cores só pelos tokens (`bg-panel`, `text-text2`, `border-line`, `text-accent`, `bg-danger-soft`…, definidos por paleta em `styles/palettes.css`); **nunca** `slate-*`/`emerald-*` (não acompanham as 3 paletas). Regras de elemento ficam em `@layer base`. Não crie classe chamada `table-row` (colide com o utilitário do Tailwind). A pasta do design não passa pelo Prettier/ESLint: não a formate.
- `packages/shared` é consumido pelo **dist** em runtime (os tipos vêm de `src`): depois de mudar o shared, rode `pnpm --filter @macpit/shared build` (`pnpm dev` e `pnpm test` já fazem isso).
- TypeScript fixado em `~6.0` porque o typescript-eslint ainda não suporta a versão 7.
- **node-pty**: o `postinstall` (`scripts/fix-node-pty.mjs`) dá `chmod +x` no `spawn-helper` pré-compilado. Se aparecer `posix_spawnp failed`, rode `node scripts/fix-node-pty.mjs`.
- Mudou o web com o servidor rodando? `pnpm --filter @macpit/web build` basta (o servidor lê o `dist` do disco a cada requisição). Mudou o server? Rebuild e reinicie.

## Regras invioláveis

1. **Servidor escuta só em `127.0.0.1`.** Nunca `0.0.0.0`.
2. Toda rota HTTP/WS exige o **token de sessão** e valida o header `Origin`/`Host` (proteção contra CSRF e DNS rebinding). Ver `docs/05-seguranca.md`.
3. Coletores de sistema (`ps`, `lsof`, `df`, ...) são executados com `execFile` e argumentos em array — **nunca** interpolar input do usuário em string de shell.
   A única exceção deliberada é a execução de **Ações**, que roda o comando salvo via `MACPIT_SHELL -lc` dentro de um pty.
4. Nunca usar `sudo` internamente. O privilégio é o do usuário que iniciou o servidor.
5. Encerrar processo exige confirmação na UI; bloquear PIDs críticos (0, 1, o próprio servidor) no backend.
6. Parsers de saída de comandos ficam em funções puras, testadas com fixtures em `apps/server/test/fixtures/`.
7. **Nunca commite saída real de `ps`/`lsof`/`env`** como fixture: linhas de comando podem conter segredos. Escreva fixtures sintéticas que reproduzam os casos difíceis.

## Organização do código

- Backend por módulo: `apps/server/src/modules/<modulo>/{routes.ts,service.ts,parser.ts}`; tudo é ligado em `apps/server/src/app.ts`.
- Frontend por feature: `apps/web/src/features/<feature>/` (componentes + hooks); páginas em `src/pages`.
- Contratos novos → primeiro em `packages/shared`, depois server, depois web.

## Blocos prontos — reutilize, não recrie

Servidor:

- `lib/exec.ts` → `run(file, args, { timeoutMs, env, okExitCodes })` para qualquer comando do sistema. Para saídas com números use `env: { ...process.env, LC_ALL: 'C' }` (o locale pt-BR usa vírgula decimal).
- `lib/http.ts` → lance `HttpError(status, msg, code)`; valide entradas com `parseOr400(schema, valor)`. O error handler global está em `app.ts`.
- `lib/audit.ts` → `audit(kind, alvo, detalhe)` para ações sensíveis (tabela `audit_log`). Nunca coloque valores de `env` ou segredos no detalhe.
- `packages/shared/src/template.ts` → `renderCommand(cmd, params, values)` / `validateTemplate`: **toda** interpolação de valores em comandos passa por aqui (valor vai por env, nunca no texto; contextos de reavaliação recusados). Nunca concatene valores do usuário num comando. Mudou o scanner? Rode `template-shell.test.ts` (bash real).
- `modules/repos/service.ts` → `RepoService.resolve(action, values)` é plugado no `RunManager` por `setPrepare` (parâmetro `type: "repo"` → cwd, valores e `MACPIT_REPO_*`). A varredura lê `.git` como arquivo; **nunca** execute `git` nela (hooks e fsmonitor de repositórios clonados).
- `modules/services/supervisor.ts` → ações `persistent` passam pelo `ServiceSupervisor` (health-check, reinício); `modules/notify/notifier.ts` → notificações (use `osascript` só com argv).
- Web: a paleta ⌘K executa ações — mudanças em `paletteItems.ts` precisam manter os testes de "não executar por engano".
- `modules/runs/manager.ts` → `RunManager` é o **único** lugar que executa comando por shell. Qualquer execução nova passa por ele. Parar = grupo de processos; não sinalize PIDs soltos.
- Canais de fluxo (terminal, log) implementam `initial()` no `ChannelProducer` para mandar o estado a cada novo inscrito; `hub.onCommand(tipo, handler)` trata mensagens do cliente (ex.: `run:input`). Novos tipos de mensagem entram em `ClientMessageSchema` (shared).
- `ws/hub.ts` → `hub.define(canal, polled(coletor, config.sampleIntervalMs))` para canal periódico; `hub.resolve(nome => producer | undefined)` para canais dinâmicos (removidos automaticamente quando ficam sem inscritos — ex.: `modules/logs/tail.ts`).
- `db/` → `openDb(caminho | ':memory:')` aplica as migrations de `db/migrations.ts` (nunca edite uma já publicada; adicione outra). `SettingsStore` guarda configurações JSON validadas com zod. **Atenção:** o `node:sqlite` liga números JS como REAL — em divisões/agrupamentos use `CAST(:x AS INTEGER)`.
- Tarefas periódicas que precisam rodar **sem inscritos** (ex.: histórico de disco) usam `setInterval(...).unref()` iniciado no `app.ts`, desligadas com `NODE_ENV=test` e paradas no `onClose`.
- Serviços recebem dependências injetáveis (`SystemDeps`, `ProcessDeps`, `RunDeps`…) para testar sem o sistema real; `buildApp(config, token, { systemDeps, processDeps, portDeps, diskDeps, duDeps, runDeps, db, audit })`. Para execuções, `test/fake-pty.ts` fornece um pty falso controlável.

Web:

- `api<T>()` (`lib/api.ts`), `useChannel<T>(canal)` e `useWsStatus()` (`hooks/useChannel.ts`), `mergeHistory` (`lib/history.ts`), `formatBytes/formatPct/formatDuration` (`lib/format.ts`).
- `WsClient.send(msg)` para mensagens de comando; `useWsStatus()` também abre a conexão.
- Painel por projeto: `useRunAction()(acao, repo)` executa no repositório escolhido (inclusive sobrepondo o padrão) ou abre o formulário com ele selecionado. `Run.repoPath` vem da resolução no servidor; nunca reconstrua o vínculo pelo `cwd` ou pela configuração atual da ação.
- Layout: toda página renderiza `<Workspace left right>` (3 colunas; laterais recolhem < 1500px — `useLayout().showRail('right')` ao selecionar algo) e `PageTitle`/`RailEmpty`. Execuções abrem no terminal do rodapé com `useDock().openRun(runId)` (nunca crie outro painel de terminal). Botões de "executar ação" usam `useRunAction()` (`RunLauncher.tsx`): decide entre executar direto, popup de repositório ou formulário nos detalhes.
- Componentes: `Modal`, `ConfirmDialog` (título, `hint`, `command`, `isRoot`), `Switch`/`Chip`/`Segmented`/`SearchInput`, `Sparkline`, `RunTerminal`, `TailViewer`; selos de estado em `features/terminal/runStyle.ts` (`serviceStyle`, `runStyle`). Classes: `.card`, `.tile`, `.eyebrow`, `.card-title`, `.btn` (+ `-sm/-md/-lg/-xl`, `-primary`, `-danger`, `-danger-outline`, `-danger-solid`, `-ghost`, `-icon`), `.input`, `.term-box`, `.kbd`, `.list-row`, `.table-head`/`.data-row`.
- Formatos pt-BR do design: `fmtNum`, `fmtBytes`, `fmtDur`, `fmtShort` (`lib/format.ts`).
- Navegação: `NAV_ITEMS` (`components/layout/nav.ts`). Detalhe de processo por link: `/processes?pid=N`.

Testes:

- HTTP: `buildApp(testConfig(), TOKEN)` + `app.inject({ headers: AUTH })` (`test/helpers.ts`).
- **Todo canal WS novo precisa de um caso em `test/ws-wiring.test.ts`**, que sobe o app de verdade e confere o snapshot.

## Armadilha conhecida: Prettier × edições por script

`pnpm format` quebra linhas longas, realinha tabelas Markdown e insere linhas em branco depois de títulos. Substituições por script (`sed`/`python replace`) sobre texto antigo **falham sem erro**. Isso já deixou canais sem registro no `app.ts` e documentação sem atualizar.
Prefira a ferramenta de edição do agente, que falha quando o trecho não bate (Edit/Write no Claude Code, `apply_patch` no Codex) e, depois de qualquer edição automatizada, confira com `grep` se o texto novo existe. A pasta `docs/design/` é a exportação do Claude Design: **nunca** a formate nem reescreva (nem com `pnpm format` — ela está no `.prettierignore`).

## Documentação (obrigatório)

Toda mudança de comportamento atualiza a documentação **no mesmo commit**:

- Feature nova/alterada → `docs/features/<feature>.md` (e link no índice `docs/README.md`)
- Endpoint/evento WS → `docs/04-api.md`
- Tabela/coluna/arquivo local → `docs/06-modelo-dados.md`
- Ameaça/mitigação → `docs/05-seguranca.md`
- Decisão arquitetural relevante → novo ADR em `docs/adr/`
- Marcar itens concluídos em `docs/03-roadmap.md` e registrar em `CHANGELOG.md` (seção Unreleased).

Para revisar, siga [docs/agents/update-docs.md](docs/agents/update-docs.md).

## Git

- Conventional Commits em português (`feat(processes): ...`, `fix(ports): ...`, `docs: ...`).
- Uma mudança = uma branch (`feat/<assunto>`, `fix/<assunto>`, `chore/<assunto>`) e um PR; nunca commite direto na `main`.
- Só faça commit, merge ou push quando a pessoa pedir. Não reescreva histórico publicado.

## Fluxos de trabalho

Roteiros compartilhados entre as ferramentas (Claude Code: comandos `/` e subagente; Codex: prompts instalados por `scripts/install-codex-prompts.sh`):

| Roteiro                                                              | Quando usar                                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/agents/implement-feature.md](docs/agents/implement-feature.md) | implementar uma funcionalidade ou item do roadmap, de ponta a ponta                                                                          |
| [docs/agents/update-docs.md](docs/agents/update-docs.md)             | sincronizar a documentação com o código                                                                                                      |
| [docs/agents/security-review.md](docs/agents/security-review.md)     | **obrigatório** antes de concluir mudanças em execução de comandos, rotas HTTP/WS, kill de processos, tail/varredura de arquivos ou segredos |

## Ambiente de execução do agente

- Os testes sobem o servidor em `127.0.0.1` (portas efêmeras e 7799 no E2E), abrem pseudo-terminais (`node-pty`) e rodam `ps`/`lsof`/`df` de verdade. Em sandbox restrito, falhas como `EPERM`, `listen EACCES` ou `posix_spawnp failed` são do sandbox, não do código: rode esses comandos com permissão fora do sandbox (ou peça à pessoa) antes de "consertar" algo.
- `pnpm e2e` usa o **Google Chrome instalado** (Playwright `channel: 'chrome'`), sem baixar navegador.
- **Nunca** use o diretório de dados real (`~/.macpit`) em testes ou experimentos: use `MACPIT_DATA_DIR=<pasta temporária>` e outra `MACPIT_PORT` (o servidor da pessoa costuma estar na 7777).
- Não execute ações salvas da pessoa nem encerre processos da máquina real para "testar".

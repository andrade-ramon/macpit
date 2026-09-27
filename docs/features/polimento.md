# Polimento (fase 7)

Status: **implementado**.

## Aparência

O tema claro/escuro da fase 7 foi **substituído** no redesign "Cockpit". Agora são três paletas escuras (Carbono, Grafite quente e Meia-noite) e a densidade das tabelas. A tecla `t` e o botão `◐` percorrem as paletas. Detalhes em [interface.md](interface.md). O `theme-light.css` e o `scripts/gen-theme-light.py` foram removidos.

## Atalhos de teclado (`features/shortcuts`)

| Tecla               | Ação                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| ⌘K / Ctrl+K         | paleta de comandos                                                              |
| `g` `h/p/o/d/a/r/s` | Visão geral / Processos / Portas / Disco / Ações / Repositórios / Configurações |
| `/`                 | focar a busca da página                                                         |
| `t`                 | alternar a paleta de cores                                                      |
| `?`                 | lista de atalhos                                                                |

- `resolveShortcut` é uma função pura, testada.
- Os atalhos não disparam enquanto você digita (inputs, xterm, diálogos abertos) nem com ⌘/Ctrl/Alt.
- O `g` espera a segunda tecla por 1,5 s.

## Estados vazios e de erro

- **ErrorBoundary por página:** um erro de renderização mostra a mensagem com "Tentar de novo" e é limpo ao trocar de página, sem derrubar o app. Os processos e ações continuam rodando no servidor.
- **Servidor desconectado:** depois de 4 s sem WebSocket, uma faixa avisa "Sem conexão com o servidor… ele ainda está rodando?". Reconexões rápidas não fazem a faixa piscar.
- **Processos:** busca sem resultado mostra "Nenhum processo encontrado para …" e o botão **Limpar filtros**.

## Iniciar com o Mac (`scripts/install-launchagent.sh`)

```
./scripts/install-launchagent.sh              # build + instala em ~/Library/LaunchAgents e inicia
./scripts/install-launchagent.sh --status     # carregado? pid? último exit?
./scripts/install-launchagent.sh --uninstall  # para e remove
./scripts/install-launchagent.sh --print      # só mostra o plist (não altera nada)
./scripts/open.sh                             # abre o painel já autenticado (lê o token)
```

- **Label:** `com.macpit.server`, com `RunAtLoad`.
- **Reinício:** `KeepAlive` com `SuccessfulExit=false` reinicia se o servidor cair, mas não depois de um encerramento limpo. `ThrottleInterval` é de 10 s.
- **Ambiente:** o launchd roda com PATH mínimo. Por isso o instalador grava:
  - o **caminho absoluto do node** (com nvm, reinstale ao trocar de versão);
  - o **PATH** e o **SHELL** atuais, para as ações acharem as mesmas ferramentas do seu terminal;
  - as variáveis `MACPIT_*` definidas no momento da instalação.
- **Log:** `~/.macpit/server.log`, criado com **0600** antes de subir. O servidor imprime a URL com o token no stdout, e o launchd criaria o arquivo com 0644.
- **Root:** o instalador recusa rodar como root. Ações como root continuam sendo feitas com `sudo ./scripts/start.sh`, manualmente.

## Serviços que sobem com o macpit (`autoStart`)

- No editor, marque "Iniciar junto com o macpit". Só vale para serviços.
- **Parâmetros:** todos precisam ter valor padrão e não podem ser secretos, porque não há ninguém para preencher o formulário no boot. O schema valida isso.
- No boot, `ServiceSupervisor.autoStartAll()` inicia cada um. A falha de um (por exemplo, cwd inexistente) é impressa e não impede os outros.
- Fica desligado com `NODE_ENV=test` (e no E2E).
- **Com o LaunchAgent:** o túnel sobe sozinho ao fazer login no Mac.
- O card mostra os selos "serviço · reinicia · no boot".

## Testes E2E (`e2e/`, Playwright)

```
pnpm e2e        # build + playwright test
```

- **Navegador:** usa o **Google Chrome instalado** (`channel: 'chrome'`), sem baixar navegador. É headless e roda com 1 worker.
- **Servidor:** o de produção, na porta 7799, com dados em `$TMPDIR/macpit-e2e` e token conhecido. `NODE_ENV=test` desliga notificações, amostragem e início automático.
- **Preparação dos dados:** `e2e/prepare-data.mjs` é o **1º passo do comando do webServer**. O Playwright sobe o `webServer` antes do `globalSetup`, e uma versão anterior que limpava os dados no `globalSetup` (e antes, no `playwright.config.ts`, que é reavaliado nos workers) apagava o banco com o servidor rodando.
- **Fluxos cobertos:**
  - acesso sem e com token;
  - criar uma ação pelo editor, executar, digitar no terminal e ver a resposta;
  - parâmetro com valor malicioso chegando como texto;
  - serviço com porta: "conectado" e depois parar;
  - portas com busca pela URL;
  - paleta ⌘K e atalhos (`g d`, `t`, `?`);
  - estado vazio de processos.
- Os artefatos de falha (trace) ficam em `test-results/`, que é ignorado pelo git.

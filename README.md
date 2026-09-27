# macpit

[![CI](https://github.com/andrade-ramon/macpit/actions/workflows/ci.yml/badge.svg)](https://github.com/andrade-ramon/macpit/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-5fe0a0.svg)](LICENSE)
![macOS](https://img.shields.io/badge/plataforma-macOS-lightgrey.svg)
![Node 24+](https://img.shields.io/badge/node-%E2%89%A524-339933.svg)

Dashboard **local** para monitorar e gerenciar o seu Mac. O servidor roda em `127.0.0.1`, você usa pelo navegador, e tudo executa no shell da própria máquina.

- **Visão geral:** CPU, memória (como o Monitor de Atividade), load, swap, disco e serviços, com gráficos ao vivo.
- **Processos:**
  - lista ao vivo com busca, filtro por usuário, ordenação e árvore;
  - encerrar com TERM, KILL, INT ou HUP;
  - arquivos e conexões abertas, com **tail ao vivo** dos logs que o processo está escrevendo.
- **Portas:** quem escuta em cada porta TCP/UDP, se está exposta na rede ou só local, com as ações "abrir no navegador" e "liberar a porta".
- **Disco:** uso por volume, histórico de 30 dias, alerta configurável e explorador das maiores pastas.
- **Ações:** comandos e scripts salvos, executados com um clique num **terminal interativo ao vivo**, com histórico e logs.
  - **Parâmetros** `{{nome}}`: um formulário pede os valores na hora, com proteção contra injeção.
  - **Repositórios:** aponte a pasta dos seus projetos (ex.: `~/github`), salve variáveis por repositório e escolha o repo na hora de rodar. A ação roda na pasta dele com os valores daquele projeto.
  - **Serviços** (ex.: túnel SSH com o banco):
    - status "conectado" pela porta esperada;
    - reinício automático se cair;
    - opção de subir junto com o dashboard.
  - Importação dos seus **aliases e funções** do zsh/bash, e exportação/importação em JSON.
- Interface "cockpit": filtros, conteúdo e detalhes lado a lado, terminal fixo no rodapé, **paleta ⌘K**, atalhos de teclado (`?`), 3 paletas de cores e notificações do macOS.

![Visão geral](docs/screenshots/visao-geral.png)

> Os comandos rodam com o usuário que subiu o servidor. Para ações que exigem root, suba com `sudo ./scripts/start.sh` (a interface mostra um aviso **ROOT**).

## Requisitos

macOS, Node **24+**, pnpm e Xcode Command Line Tools (o `node-pty` precisa delas).

## Uso

```bash
git clone https://github.com/andrade-ramon/macpit.git
cd macpit
pnpm install
pnpm build && ./scripts/start.sh     # http://127.0.0.1:7777 — abra a URL …/auth?token=… impressa no terminal
./scripts/open.sh                    # abre o painel já autenticado (com o servidor rodando)
sudo ./scripts/start.sh              # ações executando como root
```

Para subir junto com o login do Mac, e com ele os serviços marcados como "iniciar junto":

```bash
./scripts/install-launchagent.sh     # --status · --uninstall · --print
```

Pela linha de comando: `curl -H "Authorization: Bearer $(cat ~/.macpit/token)" http://127.0.0.1:7777/api/health`.

### Como app (PWA)

Com o painel aberto no Chrome ou Edge, vá em **Configurações → Instalar como app** (no Safari: Arquivo → Adicionar ao Dock). O app ganha janela própria e ícone no Dock, e mostra instruções quando o servidor não está rodando. Combine com o LaunchAgent para ele estar sempre pronto. Detalhes em [docs/features/pwa.md](docs/features/pwa.md).

## Desenvolvimento

```bash
pnpm dev          # server :7777 + Vite :5173 (a URL de acesso impressa aponta para o Vite)
pnpm test         # unidade + integração (Vitest)
pnpm e2e          # ponta a ponta (Playwright, usa o Google Chrome instalado)
pnpm typecheck && pnpm lint && pnpm format
```

### Com agentes de IA (Claude Code e Codex)

As regras do projeto ficam num só lugar, o [AGENTS.md](AGENTS.md), que o **Codex** lê direto e o **Claude Code** importa pelo [CLAUDE.md](CLAUDE.md). Os roteiros de trabalho (implementar uma funcionalidade, atualizar a documentação, revisão de segurança) estão em [docs/agents/](docs/agents/):

- **Claude Code:** `/implement-feature`, `/update-docs`, `/security-review` e o subagente `security-reviewer`.
- **Codex:** rode `./scripts/install-codex-prompts.sh` uma vez e use `/prompts:macpit-implement-feature`, `/prompts:macpit-update-docs` e `/prompts:macpit-security-review`.

## Segurança

O macpit executa comandos na sua máquina, então é na prática um shell acessível pelo navegador. As proteções:

- só escuta em `127.0.0.1`;
- exige um token (arquivo 0600) trocado por um cookie HttpOnly/SameSite=Strict;
- bloqueia Host e Origin desconhecidos (proteção contra CSRF e DNS rebinding);
- os coletores nunca passam por shell;
- valores de parâmetros nunca são colados nos comandos.

Detalhes em [docs/05-seguranca.md](docs/05-seguranca.md).

## Telas

As capturas usam os dados de exemplo do protótipo de design (`docs/design/`).

|                                                                 |                                                     |
| --------------------------------------------------------------- | --------------------------------------------------- |
| ![Processos](docs/screenshots/processos.png) Processos          | ![Portas](docs/screenshots/portas.png) Portas       |
| ![Disco](docs/screenshots/disco.png) Disco                      | ![Ações](docs/screenshots/acoes.png) Ações          |
| ![Repositórios](docs/screenshots/repositorios.png) Repositórios | ![Paleta ⌘K](docs/screenshots/paleta.png) Paleta ⌘K |

## Documentação

[docs/README.md](docs/README.md): visão, arquitetura, roadmap, API, segurança, modelo de dados, uma página por funcionalidade e ADRs.

## Contribuindo

Issues e pull requests são bem-vindos. Veja [CONTRIBUTING.md](CONTRIBUTING.md). A documentação e as mensagens da interface estão em português.

Encontrou uma falha de segurança? **Não abra uma issue pública.** Siga o [SECURITY.md](SECURITY.md).

## Licença

[MIT](LICENSE) © 2026 Ramon Andrade

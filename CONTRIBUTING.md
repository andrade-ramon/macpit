# Contribuindo

Obrigado pelo interesse! Issues e pull requests são bem-vindos. A documentação, as mensagens da interface e os commits do projeto estão em português.

## Ambiente

macOS, Node 24+, pnpm e Xcode Command Line Tools.

```bash
pnpm install
pnpm dev          # server :7777 + Vite :5173
```

Antes de abrir o PR:

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm e2e          # se mudou fluxo de interface (usa o Google Chrome instalado)
```

O CI roda os mesmos passos num runner macOS.

## Leia antes de mexer

- [docs/02-arquitetura.md](docs/02-arquitetura.md), [docs/05-seguranca.md](docs/05-seguranca.md) e a página da funcionalidade em `docs/features/`.
- [CLAUDE.md](CLAUDE.md): regras do projeto e blocos prontos para reutilizar. Vale para pessoas e para agentes de IA.

Regras que um PR não pode quebrar:

1. O servidor escuta só em `127.0.0.1`.
2. Toda rota HTTP/WS exige o token e valida `Origin`/`Host`.
3. Coletores de sistema rodam com `execFile` e argumentos em array. O único ponto com shell é o `RunManager` (ações salvas).
4. Nada de `sudo` interno.
5. Valores de parâmetros passam por `renderCommand` (vão por variável de ambiente, nunca colados no comando).
6. Parsers são funções puras com fixtures **sintéticas**. Nunca commite saída real de `ps`, `lsof` ou `env` (pode conter segredos).

## Pull requests

- Um assunto por PR, com [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat(processes): …`, `fix(ports): …`, `docs: …`).
- **Documentação no mesmo PR:** feature em `docs/features/`, endpoint em `docs/04-api.md`, dados em `docs/06-modelo-dados.md`, ameaça em `docs/05-seguranca.md` e uma linha no `CHANGELOG.md` (Unreleased).
- Mudou a interface? Siga o design em [docs/features/interface.md](docs/features/interface.md) (cores só pelos tokens) e anexe uma captura.
- Testes para o comportamento novo. Todo canal WebSocket novo entra em `apps/server/test/ws-wiring.test.ts`.

## Licença

Ao contribuir, você concorda que sua contribuição é licenciada sob a [MIT](LICENSE).

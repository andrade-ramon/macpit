---
description: Implementa uma funcionalidade do macpit de ponta a ponta (contrato → servidor → web → testes → docs)
argument-hint: <o que implementar, ou vazio para o próximo item do roadmap>
---

# Implementar uma funcionalidade

Pedido: $ARGUMENTS

(Se o pedido estiver vazio, pegue o primeiro item `[ ]` de `docs/03-roadmap.md` e confirme com a pessoa antes de começar.)

1. **Contexto.** Leia `AGENTS.md`, `docs/02-arquitetura.md`, `docs/05-seguranca.md` e a página em `docs/features/` que a mudança toca. Procure blocos prontos listados no `AGENTS.md` antes de escrever código novo.
2. **Branch.** Crie `feat/<assunto>` a partir da `main` (nunca trabalhe direto na `main`).
3. **Contrato primeiro.** Tipos e schemas zod novos entram em `packages/shared` e são compilados (`pnpm --filter @macpit/shared build`).
4. **Servidor.** Módulo em `apps/server/src/modules/<modulo>/`, ligado em `app.ts`.
   - Comando do sistema só por `lib/exec.ts` (`execFile`, args em array).
   - Execução por shell só pelo `RunManager`; valores de usuário só por `renderCommand`.
   - Entradas validadas com `parseOr400`; ações sensíveis registradas com `audit(...)`, sem segredos.
   - Parser = função pura + fixture **sintética** em `apps/server/test/fixtures/`.
   - Canal WS novo → caso em `test/ws-wiring.test.ts`.
5. **Web.** Feature em `apps/web/src/features/<feature>/`, página em `src/pages`.
   - Layout com `<Workspace left right>`; execuções pelo `useRunAction()`/`useDock()`.
   - Cores só pelos tokens do design (`docs/features/interface.md`); nada de `slate-*`/`emerald-*`.
6. **Testes.** `pnpm typecheck && pnpm lint && pnpm test` até passar. Mudou fluxo de interface? `pnpm e2e` também.
7. **Segurança.** Tocou execução, rotas, kill, arquivos ou segredos? Rode o roteiro [security-review.md](security-review.md) e corrija os achados.
8. **Docs no mesmo commit** (ver [update-docs.md](update-docs.md)): `docs/features/`, `docs/04-api.md`, `docs/06-modelo-dados.md`, `docs/05-seguranca.md`, roadmap e `CHANGELOG.md` (Unreleased).
9. **Commit** em Conventional Commits (português) — só se a pessoa pediu. Termine com um resumo: o que foi feito, como foi verificado e o que ficou pendente.

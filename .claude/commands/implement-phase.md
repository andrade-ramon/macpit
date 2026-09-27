---
description: Implementa a próxima fase pendente do roadmap
argument-hint: [número da fase opcional]
---

1. Leia `CLAUDE.md`, `docs/02-arquitetura.md`, `docs/05-seguranca.md` e `docs/03-roadmap.md`.
2. Identifique a fase $ARGUMENTS (ou a primeira com itens `[ ]`). Crie a branch `feat/fase-N-<nome>`.
3. Implemente item a item: contratos em `packages/shared` → server (com testes de parser) → web.
4. Rode `pnpm typecheck && pnpm test`. Corrija até passar.
5. Atualize docs (feature, API, modelo de dados, roadmap, CHANGELOG) conforme CLAUDE.md.
6. Faça commits em Conventional Commits e resuma o que foi feito e o que ficou pendente.

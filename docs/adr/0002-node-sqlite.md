# ADR 0002 — `node:sqlite` em vez de better-sqlite3

- Status: aceito · Data: 2026-09-27 · Substitui a escolha de banco do ADR 0001

## Contexto

A fase 4 precisa persistir o histórico de disco e as configurações; a fase 5, ações e execuções. O ADR 0001 previa o `better-sqlite3`, que exige compilar um módulo nativo (node-gyp e Xcode CLT) a cada versão do Node, e isso costuma quebrar instalações.

## Decisão

Usar o módulo `node:sqlite` (`DatabaseSync`), que já vem no Node 24. Na versão 24.18 testada, ele não emite aviso de experimental e traz o SQLite 3.53.

- Arquivo `<dataDir>/db.sqlite` (0600), com `journal_mode = WAL`.
- Migrations em `apps/server/src/db/migrations.ts`, controladas por `PRAGMA user_version`.

## Consequências

- Nenhuma dependência nativa para o banco (o node-pty da fase 5 continua sendo nativo).
- A API é síncrona, como a do better-sqlite3. Para o volume deste app, isso é adequado.
- **Pegadinha:** números JS são ligados como REAL, então `ts / :bucket` faz divisão com decimais. Use `CAST(:x AS INTEGER)`. Isso está coberto por teste em `disk.test.ts`.
- Exige Node ≥ 24 (já exigido em `engines`).

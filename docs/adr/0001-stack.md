# ADR 0001 — Stack TypeScript full-stack com Fastify, node-pty e React

- Status: aceito · Data: 2026-09-26

## Contexto

Precisamos de coleta de dados via comandos do sistema, execução interativa de comandos com terminal ao vivo e uma UI rica local.

## Decisão

Node 24 + TypeScript em monorepo pnpm; Fastify (+websocket), node-pty, better-sqlite3 (substituído por `node:sqlite` no [ADR 0002](0002-node-sqlite.md)), zod; React + Vite + xterm.js.

## Alternativas

- **Go single-binary**: distribuição melhor, mas pty/terminal web e UI exigiriam dois ecossistemas.
- **Python (FastAPI + psutil)**: psutil é ótimo, mas menos integração de tipos com o front.
- **Electron/Tauri**: app nativo desnecessário; navegador atende e é mais simples.

## Consequências

Tipos compartilhados ponta a ponta; node-pty exige build nativo (Xcode CLT). Coleta depende de ferramentas do macOS
(parsers isolados permitem suportar Linux no futuro).

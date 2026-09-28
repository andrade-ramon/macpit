# Arquitetura

```
Navegador (React + xterm.js)
   │  HTTP REST (+token)        WebSocket /ws (+token)
   ▼
apps/server (Fastify, 127.0.0.1:7777)
   ├─ modules/system     métricas globais (sysctl, vm_stat, uptime)
   ├─ modules/processes  ps → parser → snapshot; kill
   ├─ modules/ports      lsof → parser
   ├─ modules/disk       df / du; amostras p/ histórico
   ├─ modules/actions    CRUD de ações (SQLite)
   ├─ modules/runs       executor node-pty, buffer em memória + arquivo de log
   ├─ modules/logs       tail -f de arquivos (para processos externos)
   ├─ ws/                hub de canais (subscribe/unsubscribe)
   ├─ db/                node:sqlite (embutido no Node) + migrations
   └─ lib/               exec seguro (execFile), auth, config
        │
        ▼
   bash/zsh local, comandos do macOS
```

## Decisões principais

- **Node + TypeScript** em ambos os lados, contratos zod em `packages/shared` (ADR 0001).
- **Polling com push**: o servidor coleta a cada `MACPIT_SAMPLE_INTERVAL_MS` somente enquanto houver inscritos no canal;
  envia snapshot via WebSocket. Sem inscritos, nada roda.
- **node-pty** para ações: suporta programas interativos (ssh pedindo senha), cores e redimensionamento.
- **Runs** sobrevivem ao fechamento da aba (o processo continua no servidor); ao reabrir, o buffer recente é reenviado.
  Ao desligar o servidor, runs ativas recebem SIGTERM (configurável).
- **Produção**: o server serve o build estático do web (`apps/web/dist`) — um processo só, uma porta.

O [reinício pelas Configurações](features/reinicio.md) usa um controlador de ciclo de vida injetado pelo entrypoint: responde à solicitação, fecha o app e substitui o processo via `process.execve`, preservando o vínculo com o LaunchAgent. Ver [ADR 0004](adr/0004-reinicio-processo.md). O botão não executa build.

## Canais WebSocket

`system`, `processes`, `ports`, `disk`, `run:<id>`, `tail:<id>` — ver [04-api.md](04-api.md).

## Estrutura de pastas

```
apps/server/src/{index.ts, config/, lib/, db/, ws/, modules/*}
apps/server/test/{fixtures/, *.test.ts}
apps/web/src/{main.tsx, pages/, features/*, components/{layout,ui}, hooks/, lib/, styles/}
packages/shared/src/{schemas/, index.ts}
docs/, scripts/, .claude/
```

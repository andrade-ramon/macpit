# Fundação (fase 0)

Status: **implementado**.

## Inicialização

- `pnpm dev` compila `packages/shared` e sobe em paralelo: o watch do shared, o server (`tsx watch`, porta 7777, com
  `NODE_ENV=development` e `MACPIT_WEB_DEV_URL=http://localhost:5173`) e o Vite (5173, que faz proxy de `/api`, `/auth` e `/ws`).
  A URL de acesso impressa aponta para o Vite.
- `pnpm build && ./scripts/start.sh` roda um único processo que também serve `apps/web/dist` (SPA com fallback para `index.html`).
- Ao iniciar, o servidor cria `~/.macpit/` (0700) e `token` (0600, 64 hex) e imprime `…/auth?token=<token>`.

## Configuração (`apps/server/src/config`)

| Variável                         | Padrão           | Descrição                                                       |
| -------------------------------- | ---------------- | --------------------------------------------------------------- |
| `MACPIT_PORT`                    | `7777`           | porta (host é sempre `127.0.0.1`)                               |
| `MACPIT_DATA_DIR`                | `~/.macpit`      | diretório de dados                                              |
| `MACPIT_SHELL`                   | `/bin/bash`      | shell das Ações (`-lc`)                                         |
| `MACPIT_SAMPLE_INTERVAL_MS`      | `2000`           | intervalo dos canais com coleta periódica (mín. 250)            |
| `MACPIT_DISK_SAMPLE_INTERVAL_MS` | `300000` (5 min) | gravação do histórico de disco no SQLite (mín. 10 000) — fase 4 |
| `MACPIT_WEB_DEV_URL`             | —                | origem do Vite, liberada nas checagens de Host/Origin           |
| `MACPIT_WEB_DIST`                | `apps/web/dist`  | build estático servido                                          |

Variáveis vazias contam como ausentes.

## Autenticação e segurança (`lib/auth.ts`, `lib/security.ts`)

- `GET /auth?token=` troca o token pelo cookie `macpit_session` (HttpOnly, SameSite=Strict, 30 dias) e redireciona para `/`.
- `/api/*` e `/ws` aceitam o cookie ou `Authorization: Bearer <token>` (útil para `curl`).
- Hook `onRequest`: Host fora da lista → 421; Origin desconhecida → 403; upgrade WS sem Origin (e sem Bearer) → 403;
  método não seguro com `Sec-Fetch-Site: cross-site` → 403; sem credencial → 401.
- Headers `nosniff`, `X-Frame-Options: DENY` e `Referrer-Policy: no-referrer` em todas as respostas.

## Execução segura (`lib/exec.ts`)

`run(file, args, { timeoutMs=10s, maxBuffer=32MB, cwd, okExitCodes=[0] })` usa `execFile` sem shell. Em falha lança
`ExecError` com `exitCode`, `stderr` e `timedOut`.

## WebSocket hub (`ws/hub.ts`)

- `hub.define(name, producer)` registra um canal fixo; `hub.resolve(fn)` registra canais dinâmicos (ex.: `run:<id>`).
- Um `ChannelProducer` tem `start(emit) => stop`: é iniciado no primeiro inscrito e parado quando o último sai.
- `polled(collect, ms)` faz a coleta imediatamente e depois em intervalo, sem sobrepor execuções.
- Quem entra depois recebe na hora o último snapshot. Mensagens inválidas ou canais desconhecidos recebem `error`.
- Canais disponíveis: `health`, `system` ([sistema.md](sistema.md)), `processes` e `tail:<id>` ([processos.md](processos.md)), `ports` ([portas.md](portas.md)), `disk` ([disco.md](disco.md)), `run:<id>` ([acoes.md](acoes.md)).

## Web (`apps/web`)

- React 19, React Router, TanStack Query e Tailwind v4 (tema escuro).
- `lib/ws.ts`: um `WsClient` compartilhado, com reconexão em backoff exponencial (até 10 s), contagem de listeners por canal e reinscrição ao reconectar.
- `useChannel(channel)` devolve o último snapshot; `useWsStatus()` alimenta o indicador na barra lateral.
- `AppLayout` tem a barra lateral e o banner vermelho **ROOT** quando `health.isRoot`. Uma resposta 401 leva à tela "Acesso não autorizado".
- As páginas Processos, Portas, Disco e Ações mostram por enquanto um aviso de "planejado".

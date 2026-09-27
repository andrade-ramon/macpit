# App instalável (PWA)

Status: **implementado**.

O macpit pode ser instalado como app: janela própria, ícone no Dock/Launchpad e atalhos no clique direito (Ações, Processos, Portas, Disco). Ele continua sendo só a interface. Os dados vêm **sempre ao vivo** do servidor local.

## Como instalar

- **Chrome / Edge:** **Configurações → Instalar como app** (o botão **⤓ Instalar app** aparece quando o navegador oferece) ou o ícone de instalar na barra de endereço.
- **Safari (macOS 14+):** menu Arquivo → **Adicionar ao Dock…**.
- O navegador embutido do Claude Desktop **não** suporta service workers, então instale por um navegador normal.

Para o app funcionar sempre que for aberto, deixe o servidor subindo com o Mac (`./scripts/install-launchagent.sh`).

## Peças

| Peça                  | Onde                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest              | `apps/web/public/manifest.webmanifest`: nome, `start_url`/`scope` `/`, `display: standalone`, cores, atalhos                                                                                             |
| Ícones                | `apps/web/public/icons/`: 192, 512, **maskable** 512 (glifo na zona segura) e `apple-touch-icon` 180. Gerados por `node scripts/gen-icons.mjs` (renderiza o desenho do favicon no Chrome via Playwright) |
| Meta tags             | `index.html`: `manifest`, `apple-touch-icon`, `theme-color` por esquema de cor                                                                                                                           |
| Service worker        | `apps/web/src/sw/sw.ts`, que o build gera como **`/sw.js`** (nome fixo e na raiz, para ter escopo `/`). Tem tsconfig próprio (`tsconfig.sw.json`, lib WebWorker)                                         |
| Regras de cache       | `apps/web/src/sw/routing.ts`: funções puras e testadas                                                                                                                                                   |
| Registro / instalação | `apps/web/src/lib/pwa.ts`: `setupPwa()` (só no build de produção), `useInstallPrompt()`, `isStandalone()`                                                                                                |

## O que é (e o que não é) guardado

| Requisição                         | Estratégia                                                               |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `/api/*`, `/ws`, `/auth`           | **nunca** passa pelo cache (dados ao vivo; token e cookie de login)      |
| navegação (qualquer rota do front) | rede primeiro; sem servidor, devolve a **casca** (`index.html`) guardada |
| `/assets/*` (nomes com hash)       | cache primeiro                                                           |
| ícones, favicon, manifest          | responde do cache e atualiza em segundo plano                            |
| demais                             | não intercepta                                                           |

- **Pré-carga:** na instalação, o SW guarda `/`, o manifest, os ícones e os chunks referenciados pelo `index.html`. Os chunks carregados sob demanda (Disco, Ações) entram no cache na primeira visita.
- **Versão:** cada build gera um `__BUILD_ID__`, e o cache se chama `bm-shell-<id>`. O SW novo apaga os caches antigos, assume as páginas (`skipWaiting` + `clients.claim`) e a página **recarrega uma vez**, porque os chunks antigos saíram do cache e um import dinâmico falharia. Isso foi testado com um build feito com o app aberto.
- **Revalidação:** `sw.js` e `manifest.webmanifest` são servidos com `Cache-Control: no-cache`, para o navegador sempre buscar a versão nova.

## Servidor parado e sessão

- **Servidor parado:** com o app aberto e sem servidor, a casca carrega e mostra **"O servidor do macpit não está rodando"**, com os comandos para iniciar. A verificação de saúde tenta de novo a cada 5 s, e o app aparece sozinho quando o servidor volta. Se o servidor cair **depois** de o app ter carregado, aparece a faixa "sem conexão" do layout.
- **Sessão deslizante:** o cookie `macpit_session` dura 30 dias e é **renovado** a cada `GET /api/health` autenticado por cookie, o que acontece a cada 30 s com o app aberto. Na prática, o app instalado só pede login depois de 30 dias sem uso.
- **Login sem terminal:** a tela "Entrar no macpit" aceita **colar o token**. Ele vai no corpo de `POST /auth`, sem passar pela URL nem pelo histórico. Também sugere `./scripts/open.sh`.
- **Origem fixa:** o app instalado fica ligado a `http://127.0.0.1:7777`, que o navegador trata como origem segura, sem precisar de HTTPS. Se mudar `MACPIT_PORT`, instale de novo.

## Testes

- **Unidade:** `sw/routing.test.ts` (estratégias; API, WS e auth nunca em cache), `lib/pwa.test.ts`, e no servidor os testes de tipos e cabeçalhos do manifest e do SW, `POST /auth` e sessão deslizante.
- **E2E** (`e2e/pwa.spec.ts`):
  - manifest completo e ícones nos tamanhos declarados;
  - **o Chrome considera o app instalável**, via `Page.getInstallabilityErrors` do DevTools. O único erro aceito é `in-incognito`, porque contextos do Playwright são anônimos;
  - o SW controla a página;
  - **offline** abre a casca com a tela de servidor parado e volta sozinho;
  - a API nunca vem do cache;
  - login colando o token.

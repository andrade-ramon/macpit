# Segurança

Este app executa comandos arbitrários na sua máquina — é, por definição, um shell remoto. O objetivo é garantir que
**só você, no seu navegador local**, consiga usá-lo.

## Ameaças e mitigação

| Ameaça                                                    | Mitigação                                                                                                                                                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outro dispositivo na rede acessa                          | bind exclusivo em `127.0.0.1`                                                                                                                                                                                                          |
| Site malicioso aberto no navegador faz requisições (CSRF) | cookie `HttpOnly; SameSite=Strict`; qualquer `Origin` desconhecida → 403; upgrade WS exige `Origin`; `Sec-Fetch-Site: cross-site` bloqueado em métodos não seguros                                                                     |
| DNS rebinding                                             | rejeitar (421) `Host` diferente de `127.0.0.1:<porta>`/`localhost:<porta>` (+ host do Vite em dev)                                                                                                                                     |
| Outro usuário local                                       | token em arquivo `0600` no diretório de dados `0700`                                                                                                                                                                                   |
| Injeção de comando nos coletores                          | `execFile` com args em array; validação zod de PIDs/paths                                                                                                                                                                              |
| Kill acidental                                            | confirmação na UI; backend bloqueia PID 0, 1 e o próprio servidor (403 `protected`); `EPERM` vira 403 com dica de rodar como root                                                                                                      |
| Leitura arbitrária de arquivos via tail                   | `POST /api/tails` só aceita arquivo regular que o `lsof` mostra aberto pelo PID informado; id aleatório de 64 bits, de uso único                                                                                                       |
| Segredos em linhas de comando                             | fixtures de teste são sintéticas; nunca commitar saída real de `ps`/`lsof`                                                                                                                                                             |
| Rodando como root                                         | banner persistente na UI; o editor de ações mostra com qual usuário o comando roda; auditoria (`kill`, `tail`, `run`, `stop`) na tabela `audit_log`                                                                                    |
| Execução de comandos (Ações)                              | único ponto com shell (`MACPIT_SHELL -lc`, comando como **um** argumento do argv); só comandos **salvos** são executados (não há endpoint de comando avulso)                                                                           |
| Segredos em ações                                         | `env` fica em texto no SQLite 0600; a UI orienta a usar keychain/ssh-agent; o token do servidor não vai para o ambiente dos filhos; auditoria guarda comando e cwd, **não** os valores de `env`                                        |
| Processos sobrevivendo ao parar/desligar                  | parar = SIGTERM no **grupo** (pgid = pid do pty) e SIGKILL após 5 s; no desligamento, SIGKILL nos grupos que ignoram SIGTERM; após queda, o boot lista as execuções que ainda estão vivas (não mata sozinho por causa de reuso de PID) |
| Sinal no processo errado (PID reutilizado)                | só se sinaliza o grupo; sem fallback para o PID sozinho                                                                                                                                                                                |
| Esgotar recursos com execuções                            | máximo de 20 simultâneas (429), buffer de 256 KB por execução, log de até 20 MB, retenção de 50 execuções por ação                                                                                                                     |
| Derrubar o servidor por WebSocket                         | subscribe e comandos isolados em try/catch; execução apagada responde `gone`; erro de escrita do log não derruba o processo                                                                                                            |
| Servir arquivos fora do build                             | `@fastify/static` restrito a `apps/web/dist` (bloqueia `..` e dotfiles); asset inexistente dá 404 (nunca `index.html`)                                                                                                                 |

## Parâmetros de ações (fase 6)

Valores de `{{param}}` são passados como **variáveis de ambiente** e o template é reescrito para `"${MACPIT_PARAM_X}"`,
evitando injeção via valores digitados. Regras (detalhes em [acoes-avancadas.md](features/acoes-avancadas.md)):

- `{{x}}` em aspas simples é recusado, porque não seria expandido.
- `{{x}}` em **contextos de reavaliação** é recusado: `$(( ))`, `(( ))`, `[[ ]]`, `${…}`, índice de array e `let`. Nesses contextos o bash avalia o valor como expressão, e `a[$(cmd)]` executaria código. Achado do `security-reviewer` na fase 6.
- Nos casos ambíguos, o scanner recusa.
- Valores `secret` não são salvos (nem no banco, nem na execução, nem na auditoria). A auditoria guarda só o template.
- Repassar o valor a **outro** interpretador (`zsh -c "… {{x}}"`, `ssh host "… {{x}}"`) reintroduz injeção. Passe como argumento (`sh -c '… "$1"' _ {{x}}`). A importação de funções já faz isso.

Outras decisões da fase 6:

- **Paleta ⌘K:** executar exige confirmação (2º Enter). Ações só casam por trecho contínuo, e busca numérica nunca executa.
- **Notificações:** `osascript` com `on run argv`. Título e mensagem são argumentos, nunca código AppleScript.
- **Importar do shell:** é POST, porque executa o `$SHELL -ic` do usuário. Tem timeout de 15 s e só lista entradas: nada é criado sem seleção.
- **Exportar:** inclui `env` das ações. A UI avisa. Valores de parâmetros nunca são exportados, só os padrões.

## Repositórios

- A varredura só **lê arquivos** (`.git/HEAD`, `.git/config`) e não executa `git`. Assim, um repositório clonado com `core.fsmonitor` ou hooks maliciosos não roda nada. A varredura não segue links simbólicos e tem limite de pastas.
- Variáveis do repositório entram como **parâmetros** e passam pelo `renderCommand`: vão por ambiente, nunca são coladas no texto. As mesmas regras de contexto valem.
- **Variáveis secretas:** texto no SQLite 0600, igual ao `env` das ações. Nunca são devolvidas pela API (`value: ""`, `hasValue`), e o formulário deixa o campo vazio para o servidor completar. Nem a auditoria (`repo_vars`, só nomes) nem a exportação de ações as incluem.
- "Abrir pasta" (`POST /api/repos/:id/open`) roda `open` via `execFile` com o caminho como argumento, e **só** para um id da varredura: não recebe caminho do cliente.
- O link para o GitHub é sempre `https://github.com/<owner>/<nome>`, montado a partir do remote já validado.

## App instalado (PWA)

- O service worker **nunca** guarda `/api/*`, `/ws` nem `/auth`: dados, tokens e cookies não vão para o cache. Só a casca (HTML, JS/CSS com hash, ícones e manifest) é guardada. As regras estão em `apps/web/src/sw/routing.ts`, com testes.
- **Sessão deslizante:** o cookie (HttpOnly, SameSite=Strict, 30 dias) é renovado em `GET /api/health` autenticado **por cookie**. Autenticação por Bearer não cria nem renova cookie.
- **`POST /auth`:** o token colado vai no corpo, não na URL, no histórico nem em logs de acesso. Passa pelas mesmas checagens de Host, Origin e cross-site.

## Implementação

- `apps/server/src/lib/security.ts` (hook `onRequest` global) e `lib/auth.ts`. Coberto por `test/security.test.ts` e `test/ws.test.ts`.
- Clientes sem navegador (curl, scripts) usam `Authorization: Bearer $(cat ~/.macpit/token)`.
- Headers `nosniff`, `X-Frame-Options: DENY` e `Referrer-Policy: no-referrer` em todas as respostas.
- Fase 5: o agente `security-reviewer` revisou o executor, e os 5 achados (2 médios, 3 baixos) foram corrigidos com teste. As decisões correspondentes estão nas linhas acima.
- Por design (ferramenta de um só usuário): qualquer sessão autenticada pode mandar `run:input` para qualquer execução.

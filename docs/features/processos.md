# Processos (fase 2)

Status: **implementado**.

## Coleta (`apps/server/src/modules/processes`)

- Duas chamadas ao `ps -axww` com `LC_ALL=C`, porque tanto `comm` quanto `args` podem ter espaços. Cada uma deixa o campo com espaços por último:
  - `pid,ppid,uid,user,%cpu,%mem,rss,vsz,state,etime,comm`
  - `pid,args`
    As duas saídas são unidas pelo PID.
- `startedAt` = agora − `etime`, o que evita interpretar a data de `lstart`, que depende do locale.
- `name` é o nome do executável (sem o caminho). Também remove o `-` de shells de login (`-zsh` → `zsh`) e os parênteses de zumbis (`(git)` → `git`).
- `ProcessService.list()` junta chamadas simultâneas numa só coleta. `snapshot(maxAge)` reaproveita a última coleta se ela for recente.
- Canal `processes`: um snapshot completo a cada `MACPIT_SAMPLE_INTERVAL_MS`, só enquanto houver inscritos (~550 processos ≈ 150 KB).

## Detalhe

`GET /api/processes/:pid` devolve o processo, o pai, os filhos diretos e os arquivos abertos (`lsof -nP -w -p PID -F ftan`). Cada arquivo é classificado assim:

| kind                | regra                                                       |
| ------------------- | ----------------------------------------------------------- |
| `stdout` / `stderr` | fd 1/2 apontando para arquivo regular (saída redirecionada) |
| `network`           | IPv4/IPv6                                                   |
| `cwd`               | diretório de trabalho                                       |
| `file`              | outros arquivos regulares                                   |
| `other`             | pipes, sockets unix, dispositivos…                          |

`looksLikeLog` vale para stdout/stderr e para arquivos regulares abertos para escrita com extensão `.log/.out/.err/.txt` ou dentro de pasta `log/logs`.
Sem permissão (processo de outro usuário, servidor rodando sem root), `files` vem vazio e `filesError` explica o motivo.

## Encerrar

`POST /api/processes/:pid/kill` aceita os sinais `TERM` (padrão), `KILL`, `INT` e `HUP`. O backend bloqueia os PIDs 0 e 1 e o próprio servidor.
Um erro `EPERM` vira 403 com a dica de rodar como root; `ESRCH` vira 404. Todo sinal enviado é registrado em `audit.log`.

## Logs ao vivo (`modules/logs/tail.ts`)

Não é possível ler o stdout de um processo arbitrário que já está rodando. O que dá para acompanhar são os **arquivos que ele tem abertos**, o que inclui stdout/stderr quando foram redirecionados para arquivo.

1. `POST /api/tails {pid, path}` confere no `lsof` se o PID tem esse arquivo regular aberto. Se sim, cria um id aleatório e devolve `channel: tail:<id>`.
2. O cliente assina o canal. `followFile` envia os últimos 64 KB (a partir de uma quebra de linha) e depois só o que foi acrescentado, verificando o arquivo a cada 500 ms.
3. Se o arquivo for truncado ou trocado por outro (inode diferente), envia `reset` + `truncated`. Se crescer mais de 1 MB de uma vez, envia só o final com `reset`.
4. O tail é destruído quando o último inscrito sai, ou 60 s depois de criado se ninguém assinar.

## UI

- `/processes`: tabela virtualizada (`@tanstack/react-virtual`) com busca por nome, comando ou PID exato, filtro por usuário ("Meus" primeiro) e ordenação clicando no cabeçalho.
  - O modo **Árvore** ordena entre irmãos. Com busca ativa, mostra também os ancestrais, esmaecidos.
  - CPU ≥ 30% fica amarela e ≥ 80% vermelha; processos do root aparecem em vermelho; o próprio servidor ganha a marca `macpit`.
- `/processes?pid=N` abre o painel lateral, que pode ser acessado por link direto (a página de Portas vai usar isso). O painel tem:
  - dados do processo e a linha de comando completa;
  - botões de sinal com `ConfirmDialog`;
  - links para o pai e os filhos;
  - arquivos agrupados em "Logs e saídas", "Rede", "Arquivos" e "Outros", com o botão **Acompanhar**, que abre o `TailViewer` (segue o fim do arquivo, pausa ao rolar para cima e guarda no máximo 512 KB).
- Quando o processo termina, o painel mostra "O processo terminou." e esconde os dados antigos.

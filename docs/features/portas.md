# Portas (fase 3)

Status: **implementado**.

## Coleta (`apps/server/src/modules/ports`)

Uma chamada ao lsof:

```
lsof -nP -w +c 0 -iTCP -sTCP:LISTEN -iUDP -F pcuLftPnT
```

- `-n`/`-P`: não resolve nomes de host nem de porta. `+c 0`: nome completo do comando, sem o corte em 9 caracteres. `-F`: saída campo a campo, fácil de ler. Exit code 1 (nada encontrado) é aceito.
- A saída vira sockets brutos em `parseLsofSockets`. Depois, `toPortEntries`:
  - fica só com TCP em `LISTEN` e UDP com porta definida (descarta `*:*` e sockets conectados `a->b`);
  - agrupa por **protocolo + porta + PID**, juntando os endereços IPv4/IPv6 em `bindings`;
  - `scope = local` quando todos os endereços são loopback (`127.*`, `::1`, `…%lo0`); qualquer outro endereço (`*`, `0.0.0.0`, IP da LAN) torna o escopo `network`;
  - ordena por porta.
- `PortService` junta `commandLine` a partir do snapshot de processos (`ProcessService.snapshot`). Se o `ps` falhar, a lista de portas sai mesmo assim, só sem a linha de comando.
- `limited: true` quando o servidor não é root: nesse caso o lsof só enxerga os processos do próprio usuário.
- Canal `ports`: coleta a cada `MACPIT_SAMPLE_INTERVAL_MS` enquanto houver inscritos. Nesta máquina o lsof leva cerca de 30 ms.

## Encerrar o dono da porta

Não existe um endpoint próprio: a UI usa `POST /api/processes/:pid/kill`, com as mesmas proteções (PIDs 0 e 1 e o próprio servidor) e a mesma auditoria.
A confirmação deixa claro que o **processo inteiro** será encerrado, e não só a porta, e permite escolher SIGKILL.

## UI (`/ports`)

- Tabela com porta, protocolo, selo **rede**/**local** com os endereços ("todas as interfaces" para `*`), processo com a linha de comando, PID e usuário (root em vermelho).
- Busca: um número procura por **prefixo de porta** (`54` acha 5432) ou por PID exato; texto procura no processo, na linha de comando e no usuário.
- Filtros: TCP/UDP e escopo (expostas na rede / só locais).
- Ações por linha:
  - **Abrir** (só TCP): abre `http://localhost:<porta>` numa nova aba;
  - **Processo**: vai para `/processes?pid=N`;
  - **Encerrar**: fica desativado para o próprio macpit.
- Aviso fixo quando `limited`, sugerindo `sudo ./scripts/start.sh`.

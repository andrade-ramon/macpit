# Modelo de dados

Diretório de dados padrão: `~/.macpit/` (quando root: `/var/root/.macpit`, ou `MACPIT_DATA_DIR`). Criado com permissão `0700`.

> **Renomeação (bash-monitor → macpit):** se `~/.macpit` não existe e `~/.bash-monitor` existe, o primeiro boot **move** o diretório e deixa `~/.bash-monitor` como link simbólico para o novo, porque `runs.log_path` guarda caminhos absolutos (`config/index.ts`, `migrateLegacyDataDir`). Só vale para o diretório padrão.

```
~/.macpit/
  token            # ✅ 0600 — token de acesso (64 hex)
  db.sqlite        # ✅ 0600 — node:sqlite, WAL (+ db.sqlite-wal / -shm)
  runs/<runId>.log # ✅ 0600 — saída bruta de cada execução (com ANSI), até 20 MB
  audit.log        # legado (fases 2–4); a auditoria agora vai para a tabela audit_log
```

Estado só em memória (perdido ao reiniciar):

- histórico de métricas do sistema (5 min);
- tails ativos;
- cache do explorador de disco (10 min);
- buffer de 256 KB das execuções em andamento.

## Migrations

`apps/server/src/db/migrations.ts`: cada migration é aplicada numa transação, e `PRAGMA user_version` guarda a versão atual. Nunca edite uma migration publicada; crie a próxima.

| Versão | Fase | Conteúdo                                                           |
| ------ | ---- | ------------------------------------------------------------------ |
| 1      | 4    | `disk_samples`, `settings`                                         |
| 2      | 5    | `actions`, `runs`, `audit_log`                                     |
| 3      | 6    | `actions`: `persistent`, `expected_port`, `auto_restart`, `params` |
| 4      | 7    | `actions`: `auto_start`                                            |
| 5      | —    | `repo_vars` (repositórios)                                         |

## Tabelas

O reinício do servidor acrescenta o tipo `restart` à auditoria existente (`target: "macpit"`, detalhe com `activeRuns` e `uid`). Não há migration nova; `kind` é texto. `instanceId`, estado de reinício e erros do controlador ficam apenas em memória e não alteram os dados salvos.

**Painéis salvos:** `settings` usa a chave `panels.saved` com um array de até 200 objetos `{ id: string, name: string, repoPath: string, savedAt: number }`, validado pelo `SavedPanelsSchema`. Ausente = `[]`. O id é o identificador estável do repositório derivado do caminho, e `savedAt` é epoch em milissegundos. Há uma entrada por repositório; disponibilidade é calculada em memória usando a última varredura. Caminhos não encontrados continuam salvos. Não há migration nova: a tabela de configurações existente persiste esses dados entre reinícios.

**disk_samples** ✅ (v1): `mount TEXT`, `ts INTEGER` (epoch ms), `used_bytes INTEGER`, `total_bytes INTEGER`. PK `(mount, ts)`, `WITHOUT ROWID`, índice em `ts`.
Uma linha por volume a cada `MACPIT_DISK_SAMPLE_INTERVAL_MS` (padrão 5 min). Linhas com mais de 30 dias são apagadas a cada nova gravação.

**settings** ✅ (v1): `key TEXT PK`, `value TEXT` (JSON). Chaves em uso:

| key               | valor                                                    | padrão                                                            |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `disk`            | `{ alertPct: 50..99 }`                                   | `{ alertPct: 90 }`                                                |
| `notifications`   | `{ enabled, runs: none\|failures\|all, services, disk }` | `{ enabled: true, runs: "failures", services: true, disk: true }` |
| `repos`           | `{ roots: string[], maxDepth: 1..5 }`                    | `{ roots: [], maxDepth: 3 }`                                      |
| `repos.selection` | `{ paths: string[] }` (repositórios importados)          | ausente = todos importados                                        |

**actions** ✅ (v2, v3, v4): `id TEXT PK` (12 hex), `name`, `command` (pode ter `{{parâmetros}}`), `cwd?`, `env TEXT` (JSON `{NOME: valor}`), `grp?` (grupo), `icon?`, `favorite INTEGER 0/1`, `created_at`, `updated_at` (epoch ms).
v3: `persistent INTEGER 0/1` (serviço), `expected_port INTEGER?`, `auto_restart INTEGER 0/1`, `params TEXT` (JSON `[{name, label?, default?, secret, type?}]`; `type` = `text` (ausente em ações antigas) ou `repo`).
v4: `auto_start INTEGER 0/1` (serviço iniciado no boot do macpit; exige parâmetros com padrão não secreto).
Os valores de `env` e os `default` de parâmetros ficam **em texto** no banco (0600). A UI avisa para não guardar senhas ali. Valores digitados na hora da execução **não** são salvos.
O estado dos serviços (health, reinícios) fica só em memória.

**runs** ✅ (v2): `id TEXT PK`, `action_id` (FK → actions, `ON DELETE SET NULL`), `action_name` e `command` (cópias do momento da execução), `cwd` (já resolvido), `pid?`, `status` (`running | exited | failed | killed | interrupted`), `exit_code?`, `signal?` (ex.: `SIGTERM`), `started_at`, `ended_at?`, `log_path`, `log_bytes`. Índices em `(action_id, started_at DESC)` e `status`.

- `exited` = código 0; `failed` = código ≠ 0 ou morto por sinal que não foi pedido; `killed` = parado pelo usuário ou pelo desligamento do servidor; `interrupted` = estava `running` quando o servidor caiu (marcado no boot).
- Retenção: as 50 execuções mais recentes por ação. As mais antigas são apagadas junto com o log.

**Migration 6 — projeto da execução:** `runs.repo_path TEXT NULL`, com índice `runs_repo_started (repo_path, started_at DESC)`. Guarda o caminho do repositório resolvido pelo servidor no início da execução, mesmo com `cwd` próprio na ação. Não muda após edição/exclusão da ação. Execuções preexistentes e sem parâmetro `repo` permanecem com `NULL`; não há preenchimento por inferência. O campo público é `Run.repoPath`. Mover a pasta não transfere o histórico. A consulta do painel retorna até 50 recentes do projeto mais todas as ativas, dentro da retenção existente.

**repo_vars** ✅ (v5): `repo_path TEXT`, `name TEXT`, `value TEXT`, `secret INTEGER 0/1`, PK `(repo_path, name)`. São as variáveis por repositório, chaveadas pelo caminho: renomear ou mover a pasta "perde" as variáveis. Os valores ficam **em texto** no banco (0600), inclusive os segredos. Segredos nunca voltam pela API. A lista de repositórios não é persistida (fica em memória).

**audit_log** ✅ (v2): `id INTEGER PK AUTOINCREMENT`, `ts`, `kind` (`kill | tail | run | stop | repo_vars`), `target`, `detail TEXT` (JSON com `uid` e o contexto: runId, comando, sinal…).

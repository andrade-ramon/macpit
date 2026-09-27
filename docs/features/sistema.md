# Visão geral do sistema (fase 1)

Status: **implementado**.

## Coleta (`apps/server/src/modules/system`)

| Métrica      | Fonte                       | Cálculo                                                                                                                                                                       |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU          | `os.cpus()`                 | diferença dos tempos acumulados entre duas amostras. user = user + nice, sistema = sys + irq. A 1ª amostra usa como base a leitura feita quando o serviço é criado            |
| Load average | `os.loadavg()`              | 1/5/15 min. A UI compara o valor de 1 min com o número de núcleos                                                                                                             |
| Memória      | `vm_stat` + `os.totalmem()` | como o Monitor de Atividade: **apps** = anonymous − purgeable; **usada** = apps + wired + ocupada pelo compressor; **cache** = file-backed + purgeable; livre = total − usada |
| Swap         | `sysctl -n vm.swapusage`    | aceita `.` ou `,` como separador decimal; a coleta usa `LC_ALL=C`                                                                                                             |
| Uptime       | `os.uptime()`               | segundos desde o boot                                                                                                                                                         |

Os parsers são funções puras em `parser.ts`, testadas com a fixture real `test/fixtures/vm_stat.txt`. O `SystemService` recebe as dependências por injeção (`SystemDeps`), o que permite testar sem chamar o sistema real.

## Histórico

- Fica **em memória no servidor**, numa janela de 5 min (`SYSTEM_HISTORY_WINDOW_MS`). Nada é gravado em disco.
- Só é preenchido enquanto o canal `system` tem inscritos, então pode haver lacunas.
- `GET /api/system` devolve `{ current, history }`. Se a última amostra tiver mais de `MACPIT_SAMPLE_INTERVAL_MS`, coleta uma nova na hora.

## UI (`apps/web/src/pages/HomePage.tsx`)

- `useSystem()`: busca o histórico inicial por REST e depois junta as amostras do canal `system` com `mergeHistory` (sem duplicar, limitado à janela).
- Cards de CPU, memória e carga com `Sparkline`. A carga fica vermelha acima de 1 por núcleo.
- Barra com a composição da memória: apps, wired, comprimida e cache.
- Card de swap e cabeçalho com host, modelo da CPU, núcleos e uptime.
- Os gráficos são SVG próprios (o Recharts foi removido no redesign — ver [interface.md](interface.md)).

# Disco (fase 4)

Status: **implementado**.

## Volumes (`apps/server/src/modules/disk/service.ts`)

- A lista vem de `df -kP` com `LC_ALL=C`. O parser aceita espaços no filesystem (`map auto_home`, `//user@host/share`) e no ponto de montagem (`/Volumes/Backup Externo`).
- **Volumes mostrados:** `/`, discos em `/Volumes/*` e compartilhamentos de rede.
- **Volumes escondidos:**
  - volumes internos do APFS (`/System/Volumes/*`: VM, Preboot, Data…) e `/Volumes/Recovery`;
  - `devfs` e `map …`;
  - imagens do simulador do Xcode (`/Library/Developer/CoreSimulator/*`);
  - volumes com tamanho 0.
- **Usado = total − disponível.** No APFS, o `df` de `/` mostra só o volume de sistema (por exemplo 33%), mas o espaço é compartilhado pelo contêiner. O cálculo pelo disponível dá o mesmo número do Finder (por exemplo 89,5%).
- `alert = usedPct ≥ alertPct`. O limite é configurável entre 50 e 99% (padrão 90), fica guardado em `settings.disk` e é alterado por `PUT /api/disk/settings`.
- Canal `disk`: um `DiskOverview` a cada `max(MACPIT_SAMPLE_INTERVAL_MS, 5 s)`.

## Histórico

- `DiskService.startSampling` grava uma amostra por volume a cada `MACPIT_DISK_SAMPLE_INTERVAL_MS` (padrão 5 min) **sempre que o servidor está no ar**, mesmo sem ninguém na página.
- Fica desligado com `NODE_ENV=test`. A cada gravação, apaga o que tem mais de 30 dias.
- `GET /api/disk/history?mount=&range=24h|7d|30d` agrupa as amostras em intervalos de `max(intervalo de amostragem, período/300)` e devolve a média do usado em cada um. Assim são no máximo ~300 pontos, qualquer que seja o período.
- Com menos de 2 pontos, a UI explica que o histórico se forma com o tempo.

## Maiores pastas (`modules/disk/usage.ts`)

- `GET /api/disk/usage?path=` roda `du -xk -d 1 <pasta>`. O `-x` impede de entrar em outros volumes. Exit code 1 (alguns itens sem permissão) é aceito e marcado como `partial`.
- **Caminho:** aceita um caminho absoluto ou começando com `~` (o home do usuário que rodou o servidor; com root, `/var/root`). Symlinks são resolvidos e o caminho precisa ser uma pasta existente. O `du` recebe o caminho como argumento, sem shell.
- `looseBytes` = total − soma das subpastas, ou seja, os arquivos que ficam direto na pasta.
- **Cache:** os resultados ficam 10 min em memória, por caminho real. `refresh=1` ignora o cache.
- **Concorrência:** pedidos simultâneos do mesmo caminho viram uma única análise. No máximo 2 análises rodam ao mesmo tempo; um pedido a mais recebe 429.
- **Tempo:** o timeout é de 120 s (504, com a sugestão de analisar uma subpasta). Como referência, `~/github` com 36 GB levou cerca de 30 s.

## UI (`/disk`, carregada sob demanda com `React.lazy`; gráfico em SVG próprio — ver [interface.md](interface.md))

- **Cards por volume:** uso com 1 casa decimal (evita mostrar "90%" para 89,5% sem alerta), barra verde/amarela/vermelha (amarela nos 10 pontos antes do limite), usado/livre/total. Clicar no card escolhe o volume do gráfico.
- **Alerta:** uma faixa vermelha lista os volumes acima do limite. O campo "Alertar a partir de" salva o novo limite.
- **Gráfico:** `AreaChart` com períodos de 24h/7d/30d, eixo em %, linha tracejada no limite e tooltip com data, % e bytes.
- **Explorador:**
  - campo de caminho e atalhos (~, Aplicativos, Biblioteca, Usuários);
  - trilha de navegação clicável, `..` para subir e clique numa pasta para entrar;
  - barra proporcional à maior pasta;
  - as 50 maiores com "mostrar todas" (e o total das demais), mais a linha "arquivos soltos";
  - tempo decorrido durante a análise, indicação de cache e "Recalcular".
- **Home:** o card "Disco" mostra o volume `/` com a mesma cor de nível e leva para `/disk`.

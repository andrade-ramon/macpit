# Disco (fase 4)

Status: **implementado**.

## Limpeza assistida

O campo **Tamanho mínimo (MB)** filtra todas as categorias antes de gerar a prévia, inclusive Downloads antigos e caches. Usa MB decimal: 100 equivale a 100.000.000 bytes; tamanho igual ao mínimo também é incluído. Padrão 0 desativa o filtro, aceita frações de MB e máximo 1.000.000 MB. O campo é aplicado na próxima análise; não altera uma prévia já criada. Não é uma autorização para limpar: seleção e confirmação continuam obrigatórias.

Os itens da prévia têm altura variável, separadores e rolagem própria; abrir motivo/impacto expande o item sem sobrepor o próximo arquivo.

A página Disco permite analisar uma pasta dentro do diretório pessoal, revisar cada arquivo e confirmar o envio à Lixeira. A análise é local e não altera arquivos; não usa IA, shell, `sudo` ou ações salvas.

- Caminho absoluto ou `~`, padrão `~/Downloads`, no mesmo volume do diretório pessoal. Projetos são reconhecidos pela presença de um `package.json` regular; são analisados apenas os caches `node_modules/.vite`, `node_modules/.cache` e `.next/cache`. Código-fonte, `dist`, dependências e outros artefatos não são sugeridos automaticamente.
- Downloads com pelo menos 100 MiB ou modificação há 30 dias aparecem como **revisão manual**. Idade/tamanho não comprovam que o arquivo seja descartável.
- Não segue symlinks nem entra em outros volumes durante a análise. Ignora hardlinks, arquivos de outro proprietário, pastas protegidas (`Library`, `.git`, credenciais, dados do macpit, backups e pacotes de aplicativos/fotos), arquivos ocultos e nomes/extensões reconhecidos de segredos e bancos. Isso não é um detector universal de dados sensíveis: revise a seleção.
- A prévia mostra caminho completo, tamanho lógico, última modificação, categoria, motivo e impacto de **cada arquivo**. Nada vem selecionado; filtro não altera a seleção. Mostrar no Finder exige um ID da prévia e revalida o arquivo.
- Campo **Limite de arquivos** configurável entre 1 e 20.000 candidatos, padrão 10.000. Até `max(60.000, limite × 6)` entradas visitadas, 30 níveis e 120 segundos por análise. Limites/permissões produzem uma prévia parcial com avisos; somente arquivos exibidos podem ser selecionados. Cancelar interrompe a análise quando a desconexão chega ao servidor. A prévia mostra 100 arquivos por página, preservando a seleção ao paginar ou filtrar.
- Até quatro prévias em memória, com no máximo 20.000 candidatos somados entre elas, validade de 10 minutos; até 500 arquivos por execução. Prévia mais antiga é descartada quando necessário para respeitar o orçamento. Snapshots de ancestrais são compartilhados dentro de cada análise para reduzir memória e I/O. Uma análise/limpeza por vez. A confirmação lista todos os caminhos selecionados, inclusive os ocultos pelo filtro/paginação. Uma prévia utilizada não pode ser repetida.
- Antes de mover, confere identidade, tamanho, datas, permissões, proprietário, hardlinks e ancestrais; consulta `lsof`. Arquivo alterado/em uso ou conferência inconclusiva é ignorado. Uma área temporária privada ao lado do original permite conferir a identidade novamente antes de chamar o Finder.
- O Finder recebe um script fixo por `osascript` com o caminho em argv e move o arquivo à Lixeira. O macOS pode pedir permissão de Automação para controlar o Finder. Não há exclusão permanente, esvaziamento da Lixeira ou reinício de aplicativos.
- Se falhar, tenta devolver o arquivo sem sobrescrever um original novo. Se isso não for possível, preserva o arquivo e `recuperacao.json` na área temporária e informa o caminho. Uma queda abrupta também pode deixar essa área: use o manifesto para recuperar manualmente. A recuperação da Lixeira é manual para o caminho original exibido; “Colocar de Volta” pode apontar para a área temporária.
- O resultado distingue enviados, ignorados e falhas, e contabiliza apenas bytes dos envios confirmados. Tamanhos lógicos são estimativas: APFS, compressão, clones e snapshots podem mudar o espaço efetivo. Enviar à Lixeira não libera espaço; métricas do volume são consultadas novamente e o cache do explorador é invalidado.
- Fechar a página depois de confirmar não cancela a limpeza em andamento. Em erro de rede ou timeout do Finder, o resultado pode ser incerto: confira a Lixeira e analise novamente, sem repetição automática. Limite de 120 segundos entre itens; operações individuais têm timeouts próprios.

Testes usam pastas temporárias e Lixeira/Finder injetados; E2E usa respostas sintéticas e verifica prévia, seleção, cancelamento, confirmação, falhas e larguras de celular a ultrawide. Nenhum arquivo pessoal é movido nos testes.

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

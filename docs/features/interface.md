# Interface Contexto

Status: **implementado**.

O layout Contexto organiza o macpit por tarefa: navegação com nomes sempre visíveis, conteúdo principal, filtros sob demanda e detalhes do item selecionado. Substitui a navegação em pílulas e as três colunas permanentes do Cockpit. As exportações em `docs/design/` permanecem intactas como referência histórica.

## Estrutura

- **Cabeçalho:** marca, conexão e usuário/host, Filtros, Detalhes, busca de ações/páginas (⌘K), atalhos e paleta. O aviso de ROOT e a desconexão prolongada continuam acima dele.
- **Navegação:** lateral de 190px, com grupos Monitorar e Trabalhar. Todos os links têm ícone e nome; Disco e Ações mantêm contadores de alertas. Em telas até 700px, vira uma faixa de links rotulados acima do conteúdo.
- **Área de trabalho:** `Workspace` usa no máximo 1680px, centralizados no espaço disponível. Em monitores de 3440/5120px, as linhas não se estendem pela tela inteira.
- **Filtros e contexto:** Filtros abre uma faixa acima do conteúdo, com grupos que se reorganizam conforme a largura e rolagem própria. Ficam recolhidos inicialmente. A tecla `/` foca a busca visível ou abre os filtros se a busca estiver neles.
- **Detalhes:** aparecem ao selecionar um item; `RailEmpty` não reserva uma coluna vazia. Detalhes permite recolher/reabrir o contexto. Abrir Filtros recolhe os detalhes; selecionar um item volta aos detalhes.
- **Terminal:** único dock no rodapé, com controle Abrir/Recolher rotulado, abas, redimensionamento e ações existentes. Sem preferências anteriores, começa recolhido; abrir uma execução expande o terminal. Preferências existentes são preservadas.
  - Controles e área do terminal têm largura máxima de 1680px. Controles quebram em linhas quando necessário; abas permitem rolagem. A altura aberta é limitada a 65% da janela para manter o conteúdo acessível.

## Larguras

| Largura  | Comportamento                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1200px | Conteúdo e detalhes lado a lado; detalhes entre 320 e 420px.                                                                                                |
| < 1200px | Detalhes abaixo da lista, mantendo ambas as áreas com rolagem independente.                                                                                 |
| ≤ 700px  | Navegação acima do conteúdo; cabeçalho reorganiza controles em linhas. Identidade/conexão detalhadas cedem espaço; aviso de desconexão continua disponível. |
| ≥ 1100px | Busca global com texto; abaixo, botão compacto com nome acessível.                                                                                          |

Larguras são CSS pixels, incluindo o efeito de zoom. Não há escala de fonte proporcional ao monitor: telas maiores acrescentam contexto e espaço, sem aumentar controles. Tabelas com muitas colunas mantêm rolagem horizontal interna.

## Conteúdo e hierarquia

- Processos: busca sempre visível, lista com PID, nome, CPU (%) e memória; comando, usuário, estado e tempo nos detalhes. Nome é um botão acessível pelo teclado. Em listas até 580px, Encerrar fica nos detalhes. Ordenação por usuário/tempo continua nos filtros, junto de árvore, resumo e rankings.
- Portas: busca sempre visível; escopo e protocolo nos filtros.
- Ações: Nova ação e Criar com IA ficam no cabeçalho do conteúdo, sempre disponíveis. Grupos, importação e histórico ficam nos filtros/contexto.
- Demais páginas: recursos existentes continuam disponíveis em conteúdo, filtros/contexto e detalhes. Navegação de projetos, pastas de varredura e importação ficam acessíveis por Filtros.
- Cards usam cantos de 8px e tiles de 6px; cabeçalhos de tabela usam texto normal e fundo neutro. Cor de seleção, alertas e botões continua semântica. Texto secundário ganhou contraste nas três paletas.

## Aparência e componentes

Três paletas escuras: Carbono, Grafite quente e Meia-noite. Troca em Configurações → Aparência, tecla `t` ou botão `◐`. Densidade confortável (44px) ou compacta (36px); preferências existentes em `localStorage` (`macpit-palette`, `macpit-density`). Fontes Instrument Sans e JetBrains Mono são empacotadas, sem recursos externos.

Cores vêm dos tokens de `styles/palettes.css`, expostos no Tailwind por `styles/index.css`: `bg-panel`, `text-text2`, `border-line`, `text-accent` etc. Classes de layout: `app-header`, `app-body`, `app-navigation`, `app-content`, `workspace`, `workspace-content`, `workspace-filters`, `workspace-detail`, `page-title`. Componentes reutilizados: `Modal`, `ConfirmDialog`, `Switch`, `Chip`, `Segmented`, `SearchInput`, `Sparkline`, `DiskHistoryChart`, `RunTerminal`, `TailViewer`.

## Terminal e segurança das interações

`useDock().openRun(runId)` abre ou foca a execução no dock. Até oito abas, aba ativa, altura e estado aberto continuam em `localStorage` (`macpit-dock`). O xterm.js continua carregado sob demanda; links antigos `?run=<id>` continuam funcionando. Reinícios de serviços oferecem a execução atual.

Selecionar, buscar, navegar ou abrir filtros não executa comandos. Encerrar processo continua exigindo `ConfirmDialog`, com sinal/comando e aviso de root; PIDs críticos permanecem bloqueados. Os sinais adicionais ficam em Mais sinais, sem botão de encerramento forçado com destaque permanente. Ações reutilizam `useRunAction`; geração, revisão, salvamento e execução continuam separados. Filtros abertos em uma página não escondem formulários após navegar para outra.

## Validação

E2E em Chrome cobre os fluxos existentes. `e2e/interface.spec.ts` usa processos sintéticos para verificar seleção, confirmação cancelada, filtros, ordenação, terminal e ausência de overflow externo em 390, 1024, 1440, 1920, 3440 e 5120px. Nenhum processo real é encerrado nesse teste.

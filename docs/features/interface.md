# Interface (design "Cockpit")

Status: **implementado**.

A interface segue o design **Redesign Cockpit**, feito no Claude Design e exportado em `docs/design/`. A referência é `Redesign Cockpit.dc.html`. O arquivo `Atual (referência).dc.html` é o design anterior e fica só como histórico. A pasta não passa pelo Prettier nem pelo ESLint, para ficar igual ao exportado.

Para ver o design com os dados de exemplo, sirva a pasta por HTTP (o `file://` não executa o template):

```bash
cd docs/design && python3 -m http.server 7801 --bind 127.0.0.1
```

## Estrutura da tela

| Região            | O que tem                                                                                                                                                 | Onde                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Faixas no topo    | **ROOT**, em vermelho, quando o servidor roda como root; "sem conexão", em amarelo, após 4 s desconectado                                                 | `components/layout/AppLayout.tsx`              |
| Cabeçalho (56px)  | marca `>_`, estado da conexão · `usuário@host`, navegação em pílulas (selos: volumes em alerta, serviços sem resposta), busca ⌘K, `?` atalhos, `◐` paleta | `AppLayout.tsx` (`Header`)                     |
| Área de trabalho  | até 3 colunas separadas por 1px: **filtros** · **conteúdo** · **detalhes**                                                                                | `components/layout/Workspace.tsx`              |
| Terminal (rodapé) | abas das execuções abertas, redimensionável pela alça, recolhível; parar, executar de novo, baixar log, maximizar                                         | `features/terminal/TerminalDock.tsx`           |
| Paleta ⌘K         | grupos Ações · Páginas · Buscar · GitHub, com ícones; ações pedem ↵ duas vezes                                                                            | `features/palette/`                            |
| Modais            | confirmação de sinal/porta (comando exato, aviso de root), atalhos                                                                                        | `components/ui/Modal.tsx`, `ConfirmDialog.tsx` |

## Colunas e larguras

| Largura  | Comportamento                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1500px | três colunas sempre visíveis (320px · conteúdo · 460px)                                                                                                                                      |
| < 1500px | só o conteúdo; os botões **◧ Filtros** e **Detalhes ◨** do cabeçalho abrem **uma** lateral por vez. Selecionar um item (processo, porta, ação, volume, repositório) abre os detalhes sozinho |
| ≥ 1440px | a navegação mostra rótulos. Abaixo disso, só ícones (o nome aparece na dica)                                                                                                                 |
| ≥ 1100px | a busca do cabeçalho mostra o texto e `⌘K`                                                                                                                                                   |

`useLayout()` (`LayoutContext.tsx`) expõe `wide`, `rail`, `showRail()` e o modal de atalhos. A tecla `/` foca a busca da página; se a coluna de filtros estiver escondida, ela abre primeiro.

## Terminal do rodapé

- `useDock().openRun(runId)` abre, ou foca, a execução numa aba. Qualquer página usa: Home, cards de ação, histórico, paleta.
- Guarda até 8 abas, a aba ativa, se está aberto e a altura em `localStorage` (`macpit-dock`). Execuções apagadas pela retenção somem das abas.
- Links antigos `?run=<id>` ainda funcionam: abrem a execução no terminal e saem da URL.
- O xterm.js só é carregado quando há uma aba aberta (`React.lazy`). O fundo é sempre preto e o cursor usa a cor de destaque.
- Se um serviço reiniciou em outra execução, aparece **↻ Execução atual**.

## Paletas e densidade

- Três paletas escuras, todas do design: **Carbono** (padrão, verde-menta), **Grafite quente** (âmbar) e **Meia-noite** (ciano). Trocam em Configurações → Aparência, pela tecla `t` ou pelo botão `◐`.
- Densidade das tabelas: **Confortável** (linhas de 44px) ou **Compacta** (36px). A variável `--row` é lida também pela tabela virtualizada de processos.
- Ficam salvas em `localStorage` (`macpit-palette`, `macpit-density`) e são aplicadas no `<html>` (`data-palette`, `data-density`) por um script no `index.html`, antes da primeira pintura.
- O tema claro anterior foi removido, porque o design não tem versão clara.

## Tokens e classes

- As cores são variáveis CSS por paleta (`styles/palettes.css`): `--bg`, `--panel`, `--panel2`, `--panel3`, `--line`, `--line2`, `--text`, `--text2`, `--text3`, `--accent`, `--accent-ink`, `--accent-soft`, `--ok`, `--warn`, `--danger`, `--danger-soft`, `--info`.
- `styles/index.css` transforma essas variáveis em utilitários do Tailwind (`@theme inline`): `bg-panel`, `text-text2`, `border-line`, `bg-accent-soft`, `text-danger`…
- **Não use** `slate-*`, `emerald-*` e similares: não acompanham a paleta.
- Classes prontas:
  - rótulos: `.eyebrow` e `.card-title`;
  - superfícies: `.card` (raio 16px) e `.tile` (raio 12px);
  - botões: `.btn`, com tamanhos `-sm`/`-md`/`-lg`/`-xl` e variantes `-primary`, `-danger`, `-danger-outline`, `-danger-solid`, `-ghost`, `-icon`;
  - campos: `.input`;
  - comando/terminal: `.term-box`;
  - teclas: `.kbd`;
  - listas: `.list-row`;
  - tabelas: `.table-head` e `.data-row`. Não é `table-row`, que é um utilitário do Tailwind (`display: table-row`) e quebraria o grid.
- As regras de elemento (`a`, `button`, `input`…) ficam em `@layer base`. Fora de camada, venceriam os utilitários.
- Fontes: **Instrument Sans** e **JetBrains Mono**, empacotadas com `@fontsource`, sem Google Fonts. Funcionam offline no app instalado e não fazem requisição externa.
- Números no formato brasileiro (`23,4%`, `21,4 GB`, `1h 30min`): `fmtNum`, `fmtBytes`, `fmtDur`, `fmtShort` e `fmtUptime` em `lib/format.ts`.
- Componentes básicos:
  - `Switch`, `Chip`, `Segmented` e `SearchInput` (`components/ui/Switch.tsx`);
  - `Sparkline`, a área do design com 14% de opacidade;
  - `DiskHistoryChart`, em SVG próprio. O Recharts saiu do projeto.

## Diferenças deliberadas em relação ao design

O design é um protótipo com dados fixos. A implementação mantém o que o app já fazia:

- **Repositórios:**
  - coluna ✓ "importar" na tabela;
  - bloco **Importados** nos filtros, com ações em lote e o filtro importados/não importados;
  - botão ✕ para remover uma variável.
- **Processos:** acompanhar um log troca os detalhes pelo visualizador ao vivo, com **← Voltar**. Os demais arquivos abertos ficam em "Outros arquivos e conexões".
- **Visão geral:** "Atenção agora" vem de dados reais: volumes em alerta, serviços sem resposta ou reiniciando, processos zumbis. Sem nada, mostra "Tudo certo por aqui."
- **Disco:** a tendência de 24h e a previsão de chegar ao alerta são calculadas do histórico real. Sem amostras suficientes, isso é dito.
- **Abrir pasta:** o botão de Repositórios usa `POST /api/repos/:id/open`, que roda `open` com argv e só aceita caminhos vindos da varredura.
- **Editor de ação, importação do shell e telas de login/servidor parado:** o design não mostra essas telas, então elas mantêm a estrutura antiga com os tokens e as classes novas.

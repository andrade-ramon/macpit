# Repositórios

Status: **implementado**.

Informe a pasta onde ficam seus projetos (ex.: `~/github`). O macpit encontra os repositórios git dentro dela, reconhece quais são do GitHub e deixa você salvar **variáveis por repositório**. Numa ação, um parâmetro do tipo **repositório** permite escolher o repo na hora de executar. A ação então roda na pasta dele, e os demais parâmetros são preenchidos com as variáveis salvas desse repo.

Exemplo: uma única ação "Túnel banco produção", `ssh -N -L 5432:{{DB_HOST}}:5432 {{BASTION}}`, serve para vários projetos. Cada repositório guarda o seu `DB_HOST` e o seu `BASTION`.

## Como usar

1. **Repositórios** (menu, ou `g r`) → _Pastas de projetos_: adicione `~/github` e escolha a profundidade. `~/github/org/projeto` equivale a 2 níveis; o padrão é 3. Clique em **Salvar e procurar**.
2. Na lista (por padrão, **só GitHub**), abra **+ Variáveis** no repo e cadastre, por exemplo, `DB_HOST = prod-db.interno`. Marque **segredo** para valores sensíveis.
3. Em **Ações → editar**, use **+ Repositório** (ou mude o tipo de um parâmetro para _repositório_) e declare os parâmetros com os **mesmos nomes** das variáveis. Com um repositório padrão escolhido, o botão **Usar variáveis de …** cria os parâmetros de uma vez.
4. Ao executar, escolha o repositório:
   - **sem repositório padrão:** clicar em **▶ Executar** (no card, na Visão geral, na paleta ⌘K ou em "Executar de novo" no terminal) abre um **popup com a lista dos repositórios importados**, com busca e setas. Escolher um executa na hora, com as variáveis dele. Se sobrar algum parâmetro sem valor (sem padrão e sem variável no repo), abre o formulário nos detalhes com o repositório já escolhido;
   - **com repositório padrão** ou nos detalhes da ação: o formulário mostra o repositório num seletor, e os campos se preenchem com as variáveis dele, ainda editáveis. Segredos não aparecem; o servidor os completa.

## Regras

| Situação                         | Comportamento                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valor de cada parâmetro          | digitado no formulário (não vazio) → variável do repositório (mesmo nome, sem diferenciar maiúsculas) → padrão da ação                                                        |
| `{{repo}}` (o parâmetro do tipo) | vira o **caminho** do repositório                                                                                                                                             |
| Diretório                        | a pasta do repo, **se** a ação não tiver diretório próprio                                                                                                                    |
| Ambiente extra                   | `MACPIT_REPO_PATH`, `MACPIT_REPO_NAME`, `MACPIT_REPO_BRANCH`, `MACPIT_REPO_GITHUB` (`owner/nome`); os nomes antigos `BM_REPO_*` também, para ações salvas antes da renomeação |
| Padrão do parâmetro repositório  | `owner/nome` do GitHub (ou caminho). Também aceita id ou nome da pasta, se for único. Com padrão, a ação roda com **um clique** (e pela paleta ⌘K)                            |
| Limites                          | um parâmetro repositório por ação, que não pode ser segredo. "Iniciar com o macpit" exige repositório padrão                                                                  |

Os valores passam pelo mesmo mecanismo dos outros parâmetros (`renderCommand`): viram variáveis de ambiente e nunca são colados no texto do comando.

## Escolher quais importar

Cada repositório da lista tem uma caixa **importar**. Só os importados aparecem para escolha no formulário de execução, no editor de ações e na paleta ⌘K. Os botões **Importar / Não importar os N listados** agem sobre o filtro atual (busca, só GitHub, importados/não importados).

- Enquanto nenhuma seleção for salva, todos contam como importados.
- Depois da primeira escolha, repositórios novos encontrados em buscas futuras entram **desmarcados**.
- Desmarcar não apaga as variáveis do repositório. Uma ação cujo repositório padrão não está importado falha com `bad_repo` até você importá-lo de novo.

## Paleta ⌘K

Digite parte do nome (ou `gh` para listar todos): cada repositório do GitHub vira o item **abrir no GitHub ↗**, que abre a página do repo numa nova aba. A página Repositórios também está na paleta.

## Detecção

- Varredura por arquivos, **sem executar `git`** (`modules/repos/scanner.ts` + parsers puros em `git.ts`): uma pasta com `.git` (diretório, ou arquivo `gitdir:` de worktree/submódulo) é um repositório.
- A varredura não desce dentro de um repo encontrado, não segue links simbólicos e pula pastas ocultas, `node_modules`, `Library`, `vendor`, `dist`, `build`, `target`, `Pods` e `DerivedData`. Para depois de 20 000 pastas.
- **GitHub:** remote `origin` (ou o primeiro) em `https://github.com/o/r`, `git@github.com:o/r.git`, `ssh://…` ou alias de host iniciado em `github.com` (ex.: `github.com-trabalho`).
- **Branch:** lida de `HEAD`; se estiver destacado, mostra o commit curto.
- A lista fica em memória. Ela é refeita em **Procurar de novo**, ao salvar as pastas e no boot (se houver pastas configuradas), para que serviços com `autoStart` achem o repositório.

## Peças

| Peça                  | Onde                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Contratos             | `packages/shared/src/schemas/repos.ts`; `ActionParam.type` (`text`/`repo`) em `schemas/actions.ts`                         |
| Serviço               | `apps/server/src/modules/repos/service.ts` (`RepoService`: configuração, cache, variáveis, `resolve`)                      |
| Ligação com execuções | `RunManager.setPrepare(...)` em `app.ts`: vale para execução manual, paleta, serviços e reinícios automáticos              |
| Página                | `apps/web/src/pages/ReposPage.tsx`, `features/repos/`                                                                      |
| Formulário/editor     | `ActionDetail.tsx` (parâmetros nos detalhes), `ActionEditor.tsx`; regras em `actionUtils.ts` (`findRepo`, `applyRepoVars`) |
| Testes                | `apps/server/test/repos.test.ts`, `actionUtils.test.ts`, E2E "repositórios" em `e2e/app.spec.ts`                           |

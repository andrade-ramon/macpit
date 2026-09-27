# Ações avançadas (fase 6)

Status: **implementado**. Complementa [acoes.md](acoes.md).

## Parâmetros `{{nome}}` (`packages/shared/src/template.ts`)

Um comando pode pedir valores na hora de executar:

```
ssh -N -L {{porta}}:db.interno:5432 {{bastion}}
```

- Os parâmetros são declarados na ação: `name` (`[A-Za-z_][A-Za-z0-9_]{0,39}`), `label`, `default` e `secret`.
- Ao executar, a UI abre um formulário. Um campo deixado vazio usa o padrão; sem padrão, o valor é obrigatório.
- **Segurança:** o valor **nunca é colado no texto do comando**. `renderCommand` troca cada `{{x}}` por uma referência a variável de ambiente e passa o valor no ambiente do processo (`MACPIT_PARAM_X`):
  - fora de aspas: `"${MACPIT_PARAM_X}"`, entre aspas duplas para evitar word-splitting;
  - dentro de aspas duplas: `${MACPIT_PARAM_X}`;
  - dentro de **aspas simples**: erro ao salvar, porque o shell não expandiria a variável;
  - `{{x}}` não declarado ou sem valor: erro, com a mensagem mostrada na UI;
  - **contextos de reavaliação**: erro. Nesses contextos o bash avalia o conteúdo da variável como expressão, então um valor como `a[$(id)]` executaria código mesmo vindo do ambiente. São eles: `$(( ))`, `(( ))`, `[[ ]]`, `${…}`, índice de array `a[…]` e `let` (achado do `security-reviewer`). Use o parâmetro fora deles, por exemplo `n={{n}}; …`, e valide o valor antes;
  - comentários (`# …` no início de palavra) são ignorados: um apóstrofo em `# don't` não abre aspas, e um placeholder ali fica literal.
- O scanner é conservador: nos casos ambíguos do parser simplificado ele **recusa**. Heredocs não são entendidos: dentro de um heredoc, o placeholder vira texto literal `"${MACPIT_PARAM_X}"`, o que não é um risco, só não funciona.
- Um valor como `x; rm -rf ~`, `$(id)`, crases ou `a[$(id)]` é só texto para o shell. Há um teste com **bash real** (`template-shell.test.ts`) que roda 11 templates aceitos × 9 valores maliciosos e confirma que nenhum executa código.
- A validação roda no servidor (400 ao salvar e ao executar) e no editor enquanto você digita, com a mesma função do `shared`.
- `runs.command` e a auditoria guardam o **template**, nunca os valores. Parâmetros `secret` aparecem como campo de senha e o valor não é salvo em lugar nenhum.
- Cuidado com comandos que repassam texto a **outro** interpretador, como `zsh -ic "fn {{x}}"` ou `ssh host "cmd {{x}}"`: o valor é expandido pelo bash externo e depois interpretado pelo interno. Passe como argumento (`zsh -ic 'fn "$@"' _ {{x}}`). A importação de funções já gera esse formato.

## Serviços (`apps/server/src/modules/services/supervisor.ts`)

Uma ação marcada como **serviço** (`persistent`) é um processo de longa duração, como um túnel ou um servidor de dev.

| Estado       | Quando                                                                             |
| ------------ | ---------------------------------------------------------------------------------- |
| `stopped`    | não está rodando (mostra a última queda, ex.: `failed (código 255)`)               |
| `starting`   | rodando, ainda na carência de 15 s esperando a porta                               |
| `up`         | a porta esperada aceita conexão em `127.0.0.1` ou `::1`                            |
| `unhealthy`  | rodando, mas a porta não responde (passada a carência ou depois de ter respondido) |
| `running`    | rodando, sem porta configurada                                                     |
| `restarting` | caiu e vai reiniciar em `restartAt`                                                |

- **Health-check:** a cada 5 s, faz um `net.connect` na porta esperada, com timeout de 1 s. Não depende do `lsof`.
- **Reinício automático** (`autoRestart`):
  - se o processo terminar sem ninguém ter pedido (`exited`/`failed`), reinicia após 2 s, 4 s, 8 s… até 60 s;
  - se o serviço tinha rodado por 60 s ou mais antes de cair, a espera volta para 2 s;
  - usa os mesmos valores de parâmetros do último início.
- **Parar** (`POST /api/actions/:id/stop`, ou Parar na UI): encerra a execução **e** cancela um reinício pendente. Parada feita pelo usuário (`killed`) nunca dispara reinício.
- O estado fica **em memória**: quando o servidor reinicia, os serviços voltam para `stopped`. Subir serviços automaticamente com o dashboard está planejado.
- A API inclui `service` em cada ação persistente (`GET /api/actions`).

## Notificações (`apps/server/src/modules/notify`)

- Enviadas com `osascript`. Título e mensagem vão como **argumentos** (`on run argv`), nunca interpolados no AppleScript, então um nome de ação com aspas não vira código (há teste para isso).
- Configurações em `settings.notifications`, na página **Configurações** (`/settings`):
  - `enabled`;
  - `runs`: `failures` (padrão), `all` ou `none`. Execuções paradas pelo usuário e serviços não contam aqui;
  - `services`: caiu (e em quantos segundos reinicia), sem resposta na porta, conectado;
  - `disk`: volume passou do limite de alerta. Avisa só quando o volume **cruza** o limite, a cada amostra de disco (5 min).
- Há um botão de notificação de teste. Com `NODE_ENV=test`, nada é enviado.
- Rodando como root, as notificações podem não aparecer na sessão do usuário.

## Importar do shell (`apps/server/src/modules/actions/shellImport.ts`)

`POST /api/import/shell` (é POST porque executa o shell) roda o `$SHELL` **interativo** (`-ic`, que lê o seu `.zshrc`/`.bashrc`), com timeout de 15 s e `TERM=dumb`.

- **Aliases** (zsh e bash):
  - a saída de `alias` é interpretada, com aspas desfeitas; `'it'\''s'` é suportado e `$'…'` é ignorado;
  - aliases de navegação (`...`, `-`, `1`) são filtrados;
  - a ação roda o **valor expandido** do alias, que funciona no bash do executor. Um alias que chama outro alias não é expandido de novo.
- **Funções** (só zsh):
  - vêm de `${functions_source}`, filtrando as definidas em arquivos **dentro do home** e fora de frameworks (oh-my-zsh, nvm, zinit, antigen, asdf, pyenv…);
  - a ação roda `/bin/zsh -ic 'fn "$@"' _`. Argumentos acrescentados ao fim (ex.: `{{porta}}`) chegam como argv, sem virar código.
- **Na UI:** lista com filtro e checkboxes, marca o que já existe, e as escolhidas vão para um grupo (padrão "Importadas") via `POST /api/actions/import`.

## Exportar / importar JSON

- `GET /api/actions/export` baixa `macpit-acoes-AAAA-MM-DD.json` no formato `{ format: "macpit/actions", version: 1, exportedAt, actions: ActionInput[] }`.
  - **Inclui as variáveis de ambiente** das ações; a UI avisa. Não inclui estado nem histórico.
- `POST /api/actions/import` recebe `{ actions, onConflict: "skip" | "duplicate" }`. Cada ação é validada individualmente (incluindo o template), e a resposta é `{ created, skipped: [{name, reason}] }`.

## Paleta ⌘K (`apps/web/src/features/palette`)

- ⌘K / Ctrl+K em qualquer página. Setas navegam, Enter escolhe, Esc fecha.
- Repositórios do GitHub ([repositorios.md](repositorios.md)) aparecem ao digitar parte do nome ou `owner/nome`. `gh` ou `github` lista todos. Enter abre `https://github.com/<owner>/<nome>` numa nova aba. Números de porta nunca listam repositórios.
- **Itens:**
  - ações: executa; abre o formulário se a ação tiver parâmetros; abre o terminal se já estiver rodando;
  - páginas: por nome e palavras-chave;
  - "Porta N": quando a busca é um número;
  - "Processos: texto".
- **Segurança da pontuação:** como escolher uma ação a **executa**, ações só casam por trecho contínuo do nome, do grupo ou do comando. Letras soltas (subsequência) só valem para o nome, e uma busca numérica sempre vai para Portas.
  - Isso corrige um bug real encontrado no teste: "8811" + Enter executava uma ação favorita cujo comando continha 8…8…1…1.
- **Confirmação:** para uma ação sem parâmetros, o 1º Enter (ou clique) só "arma", e o item mostra "↵ de novo para executar". O 2º executa. Mudar a busca ou a seleção desarma.
- Processos e Portas guardam a busca na URL (`?q=`), e a paleta usa isso para preencher o filtro.

## Outras mudanças de UI

- **Cards de serviço:**
  - selo de estado (conectado, iniciando, sem resposta, reiniciando em Xs) e borda colorida;
  - com o serviço parado: **Iniciar** e **Log**; rodando: **Terminal** e **Parar**;
  - "pede …" lista os parâmetros.
- **Painel de terminal:** avisa quando o serviço está reiniciando e oferece **Abrir execução atual** depois de um reinício automático.
- Com o terminal aberto, os cards ficam em uma coluna. Um `min-w-0` corrigiu o estouro horizontal causado por comandos longos.
- **Home:** card **Serviços**, com o estado de cada ação persistente.

# Painéis salvos

Status: **implementado**.

## Salvar e abrir

1. Em **Repositórios**, abra o painel de um projeto.
2. Clique em **Salvar painel**. O botão passa a mostrar **✓ Painel salvo**.
3. Abra a aba **Painéis** no cabeçalho (`/panels`, atalho `g b`, também disponível na paleta ⌘K).
4. Busque por nome ou pasta e escolha **Abrir painel**. O projeto abre dentro da aba Painéis, em `/panels?project=<id>`, com as ações, serviços, portas e execuções atuais. O terminal continua sendo o rodapé compartilhado.

O painel salvo é um acesso à visão ao vivo do projeto, não uma captura das métricas, uma cópia das ações ou um ambiente que inicia serviços. Salvar e abrir não executam comandos. A lista permanece após recarregar o navegador ou reiniciar o servidor.

O nome salvo é `owner/repositório` para GitHub ou o nome da pasta para outros repositórios. Há um painel por caminho de repositório: salvar de novo é idempotente, sem duplicatas. Worktrees em caminhos diferentes continuam distintos. O limite é de 200 painéis.

## Lista e disponibilidade

- A aba mostra busca, lista de painéis e detalhes do selecionado, seguindo o layout de três colunas.
- O painel aberto pode ser trocado pela lista lateral. A seleção está na URL e sobrevive à recarga.
- Se o repositório não estiver na última varredura, o acesso permanece salvo com **Repositório indisponível**. É possível procurar novamente ou revisar as pastas configuradas. Ele volta a abrir quando o mesmo caminho é encontrado.
- Desmarcar a importação não apaga o painel: a consulta continua disponível, mas iniciar ações respeita a regra de repositório importado.
- **Remover** pede confirmação e apaga apenas o acesso salvo; não remove arquivos, ações, histórico nem interrompe serviços. Painéis indisponíveis também podem ser removidos.
- A lista é atualizada a cada 5 segundos enquanto exibida e tem botão de atualização manual; mostra carregamento, erros e estados vazios. Remoção em outra aba é refletida na próxima atualização.

## Persistência e API

`PanelService` usa o `SettingsStore`, na chave `panels.saved`, com schema compartilhado e limite de tamanho. Guarda somente `{ id, name, repoPath, savedAt }`; a disponibilidade é calculada ao consultar os repositórios. Não requer migration de banco.

- `GET /api/panels` lista os acessos e sua disponibilidade.
- `POST /api/panels` recebe `{ repoId }`, valida a existência na varredura e salva o acesso sem duplicar.
- `DELETE /api/panels/:id` remove o acesso salvo, inclusive se o repositório não existir mais.

Todas as rotas passam pela autenticação e validação global de Host/Origin. O cliente envia somente o id para salvar: nomes e caminhos são resolvidos pelo servidor. Não há cópia de variáveis, segredos, comandos ou logs.

## Verificação

Testes de API cobrem persistência ao reabrir o servidor, salvamento concorrente sem duplicatas, repositório indisponível e recuperado, limite, entradas inválidas, autenticação, Host/Origin e preservação de ações/repositórios ao remover. O E2E no Chrome cobre salvar, recarregar, navegar pela aba, buscar, abrir, recuperar e remover com confirmação, sem iniciar execuções; também verifica largura de 1200 px.

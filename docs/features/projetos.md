# Painel por projeto

Status: **implementado**.

Em **Repositórios**, clique no nome de um projeto ou em **Abrir painel do projeto** nos detalhes. A URL `/repos?project=<id>` permite recarregar ou compartilhar o contexto entre abas locais. O painel mantém as três colunas do cockpit: seleção e filtro de projetos à esquerda, visão do projeto no centro e variáveis/atalhos à direita.

## Conteúdo e execução

Use **Salvar painel** para guardar um acesso permanente ao projeto. A aba [Painéis](paineis.md) permite escolher os acessos salvos e abrir a mesma visão ao vivo, mantendo os dados no servidor entre sessões.

- **Ações disponíveis:** ações com parâmetro `type: repo`, inclusive as que têm outro repositório padrão. **Executar aqui** escolhe explicitamente o projeto aberto e usa suas variáveis; se faltar um valor, abre o formulário de Ações com esse projeto selecionado. Ações que já rodaram no projeto continuam listadas enquanto houver histórico retido, mesmo após remover o parâmetro; nesse caso, executar pelo painel fica desabilitado.
- **Serviços:** seção separada, com estado do serviço pertencente ao projeto, acesso ao terminal e botão para parar. Cada ação persistente continua tendo **uma única instância global**, como antes: se ativa em outro projeto, aparece “Ativo em outro projeto” e não pode ser iniciada aqui. Isso também vale durante reinício pendente. O backend recusa a troca com 409; a parada pelo painel inclui o projeto esperado para não atingir um serviço transferido desde a última atualização.
- **Portas:** sockets de execuções ativas vinculadas ao projeto, incluindo descendentes visíveis no snapshot de processos. Links levam à página Portas e ao detalhe do processo. Uma porta esperada no health-check não é considerada aberta sem evidência na coleta.
- **Execuções:** até 50 recentes do projeto, mais todas as ativas. Nome da ação e projeto refletem o momento da execução. Clicar abre o terminal do rodapé ou o log da execução terminada. A retenção existente de 50 execuções por ação continua valendo.

O painel consulta `GET /api/repos/:id/project` a cada 3 segundos enquanto está aberto e oferece atualização manual. Não há novo canal WebSocket. Falhas de coleta das portas geram um aviso sem ocultar ações ou histórico. Erros de atualização do painel desabilitam iniciar/parar com dados antigos. Há estados de carregamento, vazio e repositório não encontrado.

Projetos não importados permitem consultar o histórico e parar seus serviços, mas não iniciar ações. Worktrees são projetos distintos pelo caminho, mesmo quando compartilham o remote do GitHub.

## Vínculo e limites

O `RepoService.resolve` resolve o parâmetro de repositório no servidor; o `RunManager` persiste esse caminho em `runs.repo_path`. O cliente não pode atribuir um projeto arbitrário à execução. Um diretório próprio (`cwd`) na ação continua tendo precedência para a execução, mas o vínculo é com o repositório escolhido para seus parâmetros.

Execuções antigas, ações sem parâmetro de repositório e processos iniciados fora do macpit **não são associados por inferência**. Não há busca por nomes de comando, porta esperada ou coincidência de diretório. Mover uma pasta muda a identidade do projeto; o histórico permanece no caminho original. Ver [ADR 0003](../adr/0003-vinculo-projeto.md).

Para relacionar portas, a raiz precisa estar viva no `RunManager`, presente no snapshot e ter início compatível com a execução (tolerância de 3 s pela precisão de `etime`). Os descendentes são percorridos por `ppid`. Se a raiz encerrou ou um filho foi reparentado, não há associação; uma coleta limitada ou concorrente pode deixar portas de fora. A relação é informativa e não autoriza encerramento automático de processos.

## Validação

- Testes de API: isolamento entre projetos, histórico após edição/exclusão, segredos mascarados, auth/Origin/Host, serviços ativos/em reinício e parada com contexto desatualizado.
- Migração de banco v5 preserva execuções existentes com vínculo nulo.
- Testes de associação: descendentes, PID reutilizado, processo encerrado durante coleta e falha parcial.
- E2E com Chrome: abrir painel, escolher projeto diferente do padrão, iniciar serviço sintético, observar porta, recarregar URL, bloquear outro projeto, parar, abrir log e preencher parâmetro pendente.

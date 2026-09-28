# ADR 0003 — Vínculo explícito entre execução e projeto

Status: aceito.

## Contexto

Uma ação reutilizável pode rodar em vários repositórios e ter seu comando, diretório ou repositório padrão editados. Reconstruir seu projeto a partir da configuração atual mistura históricos. Nomes de processo e portas também não identificam um projeto com segurança.

## Decisão

Registrar em cada execução o caminho do repositório resolvido no servidor a partir do parâmetro `repo`. O campo `repo_path` é nulo nas execuções antigas e nas ações sem esse parâmetro. Não preencher retrospectivamente por `cwd`. Usar o caminho distingue worktrees que compartilham remote.

O painel agrega contratos existentes por uma rota REST autenticada, consultada apenas enquanto aberto. As portas são relacionadas pelas árvores de processos de execuções ainda vivas, com verificação do início da raiz. O vínculo não introduz novas permissões ou execução de comandos.

Serviços continuam únicos por ação. Tentativas de iniciar em outro projeto enquanto ativos ou aguardando reinício são recusadas; a parada no painel verifica o projeto esperado.

## Consequências

O histórico não muda quando a ação é editada ou excluída. Execuções sem vínculo explícito ficam fora do painel. Mover um repositório não transfere seu histórico automaticamente. Processos externos ou reparentados não aparecem nas portas do projeto. Instâncias simultâneas de uma mesma ação persistente por projeto exigiriam outra evolução do supervisor.

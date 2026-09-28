# ADR 0004 — Reinício por substituição do processo

Status: aceito.

## Contexto

O botão de reinício precisa carregar novamente o código do servidor, funcionar tanto no terminal quanto sob LaunchAgent e preservar sessão e dados. Reiniciar só o Fastify manteria módulos antigos no cache. Criar outro processo em segundo plano perderia a identidade supervisionada pelo launchd e exigiria coordenar disputa de porta.

## Decisão

O entrypoint fornece um controlador ao `buildApp`. Após responder ao pedido autenticado e confirmado, fecha o app normalmente e chama `process.execve` com o mesmo executável, argv e ambiente. Essa API do Node é experimental e tem disponibilidade verificada em runtime; sem suporte e em desenvolvimento, o endpoint recusa a operação sem encerrar o servidor.

Um `instanceId` aleatório distingue inicializações sem depender de mudança de PID. A interface aguarda uma instância diferente antes de recarregar. A auditoria registra a intenção de reiniciar, sem copiar configuração ou segredos.

## Consequências

Preserva PID, usuário, stdio e vínculo com o supervisor. Não precisa de shell, instalação de serviço ou privilégios extras. Execuções ativas são encerradas pelo mecanismo existente, e apenas serviços com `autoStart` voltam. O código deve estar compilado previamente. A substituição pode falhar após fechar o app; nesse caso a saída não zero permite recuperação pelo LaunchAgent, ou início manual quando não há supervisor. Cobertura E2E verifica a substituição real apenas no servidor isolado de teste.

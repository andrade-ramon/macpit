# Reiniciar o macpit

Status: **implementado**.

Em **Configurações → Servidor do macpit**, o botão **Reiniciar macpit** pede confirmação e mostra quantas execuções estão ativas. Ele reinicia somente o aplicativo; não reinicia o macOS.

## Comportamento

1. O navegador envia `POST /api/server/restart` com `{ confirm: true }`.
2. O servidor valida a solicitação, verifica o executável/entrypoint, registra a auditoria e responde 202 antes de fechar as conexões. Solicitações duplicadas durante o reinício retornam 409.
3. O fechamento normal do app cancela reinícios de serviços, encerra execuções pelos grupos de processos (SIGTERM, escalando a SIGKILL após a carência existente), interrompe coletores/canais e fecha o SQLite.
4. `process.execve` substitui o processo pelo mesmo Node, argumentos e ambiente. O PID, os descritores padrão e a supervisão do LaunchAgent são preservados. Os módulos são carregados novamente do disco; o botão não executa build.
5. O navegador consulta `/api/server` a cada segundo enquanto espera. Cada inicialização recebe um novo `instanceId`; quando ele muda, a página recarrega. O PID sozinho não indica reinício, pois é preservado.

As configurações, ações, histórico e painéis salvos permanecem no banco. Execuções interrompidas pelo fechamento ficam como `killed`. Só os serviços já configurados com `autoStart` voltam automaticamente. A mesma sessão continua válida.

## Disponibilidade e falhas

- Disponível no entrypoint compilado (`pnpm start`, `scripts/start.sh` ou LaunchAgent) com Node que disponibiliza `process.execve` — ver [ADR 0004](../adr/0004-reinicio-processo.md).
- No modo `development`, ou em runtimes sem essa função, o botão fica desabilitado com orientação para reiniciar pelo terminal. `buildApp` isolado não ganha permissão para reiniciar o processo; o controlador é injetado pelo entrypoint.
- Após 60 segundos sem uma nova instância, aparece uma orientação para verificar o servidor no terminal; a tentativa de reconexão continua.
- Uma falha de preparação não fecha o servidor. Se a substituição falhar depois do fechamento, o processo termina com código 1 e mensagem genérica; o LaunchAgent pode recuperá-lo pela política existente. Fora de um supervisor, será necessário iniciar pelo terminal.
- Para disponibilizar esta funcionalidade em um servidor que já estava rodando com uma versão anterior, é preciso reiniciá-lo uma vez pelo método habitual. Depois disso, o botão usa a nova rota.

## Segurança e testes

Rotas autenticadas com validações de Host/Origin e bloqueio de POST cross-site. O corpo só aceita `{ confirm: true }`; não há campo para comando, caminho, ambiente ou PID. Não usa shell, `sudo`, `launchctl` nem comandos de reinício do sistema operacional. Auditoria `restart` registra apenas o alvo `macpit` e a quantidade de execuções ativas.

Testes de API cobrem confirmação obrigatória, indisponibilidade, autenticação, Host/Origin, duplicatas, auditoria, falhas de preparação e execução. E2E no Chrome reinicia de verdade o servidor **de teste**, encerra uma execução sintética, verifica novo `instanceId`/mesmo PID, sessão preservada, painel salvo e recarga automática. Nunca usa o diretório de dados real para testar.

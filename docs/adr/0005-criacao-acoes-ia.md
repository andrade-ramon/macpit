# ADR 0005 — Criação assistida de ações por IA

Status: **aceito**. Data: 2026-09-28.

## Contexto

O macpit já valida e executa comandos salvos. A criação em linguagem natural acrescenta uma API externa, custos e uma nova credencial sensível. A saída de um modelo não é uma autorização para executar comandos nem uma prova de que eles são seguros.

## Decisão

- Um módulo `ai` sem dependência de RunManager produz rascunhos. Salvar reutiliza o CRUD existente e exige revisão no editor; executar continua separado.
- Adaptadores HTTP Gemini e Anthropic usam endpoints HTTPS fixos, autenticação por header, saída estruturada e redirecionamentos recusados. Sem SDK adicional, ferramentas ou chamadas automáticas de reparo. Dependência `AiGenerate` injetável nos testes.
- Contratos e catálogo em shared. Schema externo usa um subconjunto de JSON Schema; validações completas zod, ActionInputSchema e validateTemplate são locais. Schema do rascunho exclui env, cwd e automações. Não se tenta certificar a semântica de shell por regex.
- Uma configuração ativa em `settings.ai`. Credencial vinculada ao provedor, em memória ou `ai-credential.json` 0600 dentro de diretório 0700, com gravação atômica. Não usar SQLite, process.env, localStorage ou exportação de ações para essa chave. Trocar provedor remove a credencial anterior; trocar modelo preserva.
- Persistência em texto é explícita na UI. Keychain exigiria integração nativa e tratamento de sessão/LaunchAgent; fica como evolução. Permissões não protegem contra processos maliciosos do mesmo usuário, root ou cópias de backup do diretório.
- Conversa/rascunhos ficam no estado React e são enviados explicitamente a cada rodada, com limite total. Sem leitura automática de arquivos/repositórios/logs. Provedor/modelo esperados acompanham o pedido para rejeitar mudanças de destinatário entre a revisão na UI e a chamada.
- HTTP sem streaming, timeout/cancelamento, uma chamada simultânea e dez por minuto. Auditoria só de metadados. Fechar o diálogo ou desconectar aborta a chamada quando possível; não há garantia de estorno no provedor.

## Consequências

A criação funciona sem alterar o executor, canais WS, migrations ou ações existentes. Provedores podem mudar modelos, disponibilidade e cobrança: o teste de conexão verifica o formato real com uma chamada faturável. A suíte usa provedores simulados; credenciais reais não são necessárias para CI. Leitura opcional de projetos, outros provedores, criação em lote e diagnóstico de execuções exigirão decisões próprias de escopo e privacidade.

# Criar ações com IA

Status: **implementado e verificado com provedores simulados**. Plano aprovado para início em 28/09/2026 e preservado abaixo com os detalhes da entrega. Não exige IA para usar as demais funcionalidades do macpit. Validação com credenciais reais permanece pendente.

## Objetivo e fluxo

O usuário configura provedor, modelo e API key em **Configurações → IA**, abre **Criar com IA** em Ações e descreve o objetivo. O servidor pede esclarecimentos quando necessário, gera um rascunho validado e explica comando, requisitos e efeitos. O usuário pode refinar o pedido, revisar no editor existente e salvar. Gerar e salvar não executam comandos; a execução continua pelo fluxo normal de ações.

## Escopo aprovado

- Uma ação por pedido; Gemini e Anthropic, com um provedor ativo por vez e adaptadores independentes.
- Respostas estruturadas: `needs_input`, `draft` ou `unsupported`.
- Nome, comando parametrizado, grupo, ícone e serviço/porta esperada; informações ausentes viram perguntas ou parâmetros, nunca hosts/caminhos inventados.
- Revisão reutiliza `ActionEditor`; geração não recebe `RunManager`, ferramentas, shell ou leitura de arquivos.
- `autoStart` e `autoRestart` desativados nos rascunhos. Parâmetros secretos sem padrão; nenhum `env` gerado.
- IA não configurada, chave inválida, cota, timeout, cancelamento e resposta inválida têm recuperação sem perder o último resultado válido.

## Credenciais e privacidade

A chave pode durar apenas a sessão do servidor ou ser lembrada no computador. O modo persistente usa arquivo dedicado em `MACPIT_DATA_DIR`, diretório `0700`, arquivo `0600`, gravação atômica e validação de permissões. É texto protegido por permissões, **sem criptografia**; Keychain fica para evolução. A chave nunca é retornada pela API, colocada em `process.env`, exportada com ações ou registrada em logs/auditoria. A UI permite substituir/remover e limpa o campo após salvar; não usa localStorage para credenciais ou rascunhos.

Somente pedido, esclarecimentos, rascunho, plataforma/shell e regras do macpit vão ao provedor. Não enviar automaticamente arquivos, logs, processos, caminhos locais, outras ações ou variáveis de repositório. Projeto e diretório podem ser escolhidos localmente no editor. A UI identifica o destinatário e orienta a não digitar segredos: detecção automática não é garantia. Endpoints externos são HTTPS fixos, sem URLs configuráveis ou redirecionamentos.

## Contratos e organização

Contratos primeiro em `packages/shared/src/schemas/ai.ts`, backend em `apps/server/src/modules/ai/`, UI em `apps/web/src/features/ai/`. Reutilizar SettingsStore, HttpError, parseOr400, ActionInputSchema, validateTemplate, ActionEditor e o POST de ações existente.

| Rota implementada           | Responsabilidade                           |
| --------------------------- | ------------------------------------------ |
| `GET /api/ai/settings`      | Configuração pública e presença de chave   |
| `PUT /api/ai/settings`      | Provedor e modelo                          |
| `PUT /api/ai/credential`    | Substituir chave e armazenamento           |
| `DELETE /api/ai/credential` | Remover chave                              |
| `POST /api/ai/test`         | Testar autenticação e resposta estruturada |
| `POST /api/ai/drafts`       | Gerar/refinar sem persistir ação           |
| `POST /api/actions`         | Salvamento explícito no fluxo existente    |

Todas as rotas exigem sessão e Host/Origin globais e retornam `no-store`. HTTP sem streaming na primeira versão; não há canal WS novo. Provedores recebem `aiDeps.generate` injetável para testes sem rede. O pedido inclui `configuration: { provider, model }`: se o destinatário mudou desde a revisão na UI, o servidor recusa antes de enviar.

Modelos do catálogo inicial: Gemini `gemini-3.5-flash` e `gemini-2.5-flash`; Anthropic `claude-sonnet-4-6` e `claude-haiku-4-5-20251001`. A disponibilidade depende da conta; o teste de conexão faz uma geração no modelo escolhido. Adaptadores usam GenerateContent (Gemini) e Messages com output_config (Anthropic), sem SDK adicional.

## Validação e limites

Resposta externa é entrada não confiável: limite de bytes, JSON, zod, conversão, ActionInputSchema/validateTemplate e restrições da geração. Avisos não certificam segurança semântica de shell; a revisão humana continua necessária. Nenhum comando é executado para testar a sugestão. Não repetir chamadas faturáveis automaticamente.

Limites iniciais: pedido de 8 mil caracteres, seis rodadas anteriores e contexto total limitado, uma chamada em andamento, dez chamadas por minuto (inclui teste), timeout de 45 segundos, limite de tokens/bytes por adaptador. Cancelar aborta a requisição quando possível; cobrança já iniciada pode permanecer. Respostas atrasadas não sobrescrevem o estado atual.

Configuração pública em `settings.ai`; ação final na tabela existente; conversa e rascunho só em memória. Auditoria guarda provedor/modelo, duração, resultado e uso, nunca conteúdo ou chave. Nenhuma migration é necessária para essa versão.

## Etapas e aceite

- [x] Contratos, catálogo de modelos, ADR e documentação do plano.
- [x] Configuração, armazenamento de chave, remoção e teste de conexão.
- [x] Adaptadores, prompt, validação, cancelamento e limites.
- [x] Interface: pedido, perguntas, explicação, requisitos e refinamento.
- [x] Revisão integrada ao editor e salvamento, sem executar e sem duplo envio.
- [x] Testes unitários/HTTP com provedores falsos: contratos, credenciais, permissões, rotação, falhas, limites, cancelamento, autenticação e ausência de efeitos colaterais.
- [x] E2E Chrome: configuração, erro/repetição, esclarecimento, geração, refinamento, revisão e criação; três paletas e viewport reduzido.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, revisão de segurança e documentação final.

Validação com provedores reais é separada, exige chave fornecida para desenvolvimento e pode gerar cobrança. Não é requisito da suíte automatizada. Testes usam diretório temporário e nunca executam ações da pessoa.

## Verificação da entrega

Em 28/09/2026: typecheck e lint passaram; 326 testes de shared/server/web e 20 E2E Chrome passaram. O módulo acrescenta 44 casos unitários/HTTP/adaptadores e quatro E2E. Adaptadores foram exercitados com fetch simulado; testes HTTP injetam o provedor; E2E intercepta respostas de geração/teste e usa configuração/credenciais/salvamento reais no servidor temporário. Nenhuma chave ou chamada real de IA foi usada. Capturas do fluxo foram inspecionadas em desktop, nas três paletas, e em 390 px de largura.

Revisão conforme `docs/agents/security-review.md`: **sem achados pendentes no escopo revisado**. Verificados bind/Host/Origin/autenticação, destinos fixos/redirects, limites e cancelamento por desconexão, armazenamento sem links, ausência de chave em respostas/auditoria/SQLite/exportação/pty, validação estrita de templates e separação entre geração, salvamento e execução. Acrescentada proteção contra mudança de provedor/modelo entre UI e envio. Permanecem os limites deliberados: revisão humana de comandos arbitrários, chave persistente em texto 0600 e políticas de retenção/cobrança do provedor.

## Evoluções posteriores

Keychain, outros provedores, endpoints personalizados com política de destinos, criação em lote, edição de ações existentes, diagnóstico de execuções e leitura opcional de arquivos do projeto. Esses itens não fazem parte da primeira entrega.

## Referências

- [Gemini: saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output)
- [Anthropic: saída estruturada](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Ações](acoes.md), [parâmetros e serviços](acoes-avancadas.md), [segurança](../05-seguranca.md).

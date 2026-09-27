# CLAUDE.md

As regras do projeto (stack, comandos, regras invioláveis, blocos prontos, documentação e git) estão no `AGENTS.md`, compartilhado com o Codex. Elas valem integralmente aqui:

@AGENTS.md

## Específico do Claude Code

- **Comandos:** `/implement-feature <pedido>`, `/update-docs [escopo]` e `/security-review [escopo]` rodam os roteiros de `docs/agents/`.
- **Subagente `security-reviewer`** (`.claude/agents/`): use proativamente antes de concluir mudanças em execução de comandos, rotas HTTP/WS, kill de processos, leitura de arquivos ou segredos. Ele só lê e relata.
- **Permissões** do projeto em `.claude/settings.json`: `pnpm`, leitura do git e `ps`/`lsof`/`df` liberados; `sudo` e leitura de `.env` bloqueados.
- **Edição:** use Edit/Write em vez de `sed`/scripts de substituição (ver "Armadilha conhecida" no `AGENTS.md`).
- **Navegador embutido do Claude Desktop:** bom para conferir telas, mas não suporta service worker. Para o PWA use o Chrome (`pnpm e2e`).
- **Regra nova ou alterada?** Edite o `AGENTS.md`, não este arquivo (que só guarda o que é exclusivo do Claude Code).

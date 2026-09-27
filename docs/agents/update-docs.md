---
description: Sincroniza a documentação do macpit com o código atual
argument-hint: <escopo opcional, ex. "repositórios" ou um intervalo de commits>
---

# Atualizar a documentação

Escopo: $ARGUMENTS (vazio = as mudanças da branch atual em relação à `main`).

1. Veja o que mudou: `git diff main...HEAD` (e o que ainda não foi commitado).
2. Compare com a documentação e corrija o que estiver desatualizado:
   - funcionalidade nova ou alterada → `docs/features/<feature>.md` (e link em `docs/README.md`);
   - endpoint ou evento WS → `docs/04-api.md`;
   - tabela, coluna, chave de `settings` ou arquivo local → `docs/06-modelo-dados.md`;
   - ameaça ou mitigação → `docs/05-seguranca.md`;
   - decisão de arquitetura → novo ADR em `docs/adr/`;
   - item concluído → `docs/03-roadmap.md`; registro em `CHANGELOG.md` (Unreleased);
   - regra ou bloco pronto novo para agentes → `AGENTS.md` (nunca só no `CLAUDE.md`).
3. **Documente só o que existe.** O que for futuro fica marcado como planejado.
4. Não mexa em `docs/design/` (exportação do Claude Design).
5. Rode `pnpm format` e confira com `grep` que o texto novo está nos arquivos (o Prettier reformata tabelas e pode fazer substituições por script falharem sem erro).

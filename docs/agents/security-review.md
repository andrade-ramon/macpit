---
description: Revisão de segurança do macpit (somente leitura) contra o modelo de ameaças
argument-hint: <escopo opcional: arquivos, branch ou commits>
---

# Revisão de segurança

Escopo: $ARGUMENTS (vazio = `git diff main...HEAD` mais o que não foi commitado).

O macpit é, na prática, um shell acessível pelo navegador. Revise o escopo contra `docs/05-seguranca.md`. **Não edite arquivos**: só relate.

Verifique:

- **Rede:** bind só em `127.0.0.1`; token exigido em toda rota HTTP e no upgrade do WebSocket; checagem de `Host` (421) e `Origin`/`Sec-Fetch-Site` (403).
- **Execução:** nenhum valor de usuário concatenado em string de shell. Coletores usam `execFile` com args em array; o único ponto com shell é o `RunManager`; valores de `{{parâmetros}}` e variáveis de repositório passam por `renderCommand` (vão por env; contextos de reavaliação — `$(( ))`, `[[ ]]`, `${…}`, índice de array, `let` — recusados).
- **Entradas:** validação zod (`parseOr400`) em todo body, params e query; caminhos resolvidos e verificados antes de ler (tail só de arquivo aberto pelo PID; varredura de repositórios sem seguir links e sem executar `git`).
- **Processos:** PIDs 0, 1 e o próprio servidor bloqueados; parar = grupo de processos, sem sinalizar PID solto (reuso de PID).
- **Segredos:** token nunca em logs, auditoria, URLs persistidas ou ambiente dos filhos; parâmetros e variáveis `secret` nunca voltam ao navegador nem vão para a auditoria/exportação; fixtures sem saída real de `ps`/`lsof`/`env`.
- **Privilégio:** nenhum `sudo` no código; nada que mude comportamento por rodar como root sem aviso na UI.
- **Web:** service worker nunca guarda `/api`, `/ws` ou `/auth`; links externos com `rel="noopener noreferrer"`; nada de `dangerouslySetInnerHTML` com dados do sistema.

Formato do relatório (do mais grave para o menos):

- `arquivo:linha` — severidade (alta/média/baixa) — o problema, um cenário concreto de exploração e a correção sugerida.

Se não houver achados, diga isso explicitamente e liste o que foi verificado.

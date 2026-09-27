# Política de segurança

O macpit executa comandos na sua máquina: na prática, é um shell acessível pelo navegador. Por isso, falhas de segurança são tratadas com prioridade.

## Como relatar

**Não abra uma issue pública.** Use o relato privado do GitHub: aba **Security → Report a vulnerability** em <https://github.com/andrade-ramon/macpit/security/advisories/new>.

Inclua, se possível:

- versão (commit) e macOS;
- passos para reproduzir e o impacto (ex.: executar comando a partir de outra origem, ler arquivos, escalar privilégio);
- uma prova de conceito mínima.

Você recebe uma resposta em até 7 dias. Depois da correção, a falha é divulgada num advisory com crédito a você (se quiser).

## Escopo

Interessa especialmente qualquer coisa que quebre o modelo de ameaças de [docs/05-seguranca.md](docs/05-seguranca.md):

- acesso por outra máquina ou por outra origem no navegador (CSRF, DNS rebinding, WebSocket);
- contornar o token de sessão;
- injeção de comando pelos coletores (`ps`, `lsof`, `df`, `du`) ou pelos valores de `{{parâmetros}}`;
- leitura de arquivos pelo tail de logs ou pela varredura de repositórios;
- vazamento de segredos (variáveis secretas, token) para o navegador, logs ou auditoria.

Fora do escopo: o que o próprio usuário executa de propósito numa ação salva, e ataques que já exigem acesso à conta local do usuário (o token fica num arquivo `0600` da própria conta).

## Versões suportadas

Só a versão mais recente da branch `main` recebe correções.

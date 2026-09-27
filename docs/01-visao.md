# Visão

Um "painel de controle" local do Mac para quem vive no terminal: ver o que está rodando, o que está ocupando
portas e disco, e transformar comandos que você precisa lembrar (aliases, scripts de túnel, etc.) em botões.

## Princípios

- **100% local**: servidor em `127.0.0.1`, UI no navegador, sem nuvem, sem telemetria.
- **Transparente**: toda ação mostra o comando exato que será executado.
- **Privilégio explícito**: roda como o usuário que iniciou; root apenas se iniciado com `sudo` (a UI exibe um banner "ROOT").
- **Leve**: coleta via comandos nativos do macOS (`ps`, `lsof`, `df`, `du`, `sysctl`, `vm_stat`).

## Funcionalidades

> **Status (fase 7):** tudo do MVP e das propostas abaixo está implementado, exceto o item “Futuro”. O que foi feito em cada fase está em [03-roadmap.md](03-roadmap.md) e em `features/`.

### MVP (pedido original)

1. **Processos** — tabela com PID, PPID, usuário, CPU%, MEM%/RSS, estado, início, comando; busca, ordenação, árvore pai/filho;
   encerrar (SIGTERM → SIGKILL com confirmação); detalhe com arquivos abertos, conexões e ambiente (quando permitido).
   _Logs:_ processos arbitrários não expõem stdout; para eles mostramos arquivos de log abertos (`lsof`) com tail ao vivo.
   Para processos iniciados pelo dashboard (Ações), o stdout/stderr completo é capturado.
2. **Portas** — `lsof -iTCP -sTCP:LISTEN` + UDP: porta, protocolo, endereço, PID, processo; encerrar dono; ver o processo.
3. **Disco** — uso por volume (`df`), gráfico histórico, alerta de limite, explorador "maiores pastas" (`du`) sob demanda.
4. **Ações** — CRUD de comandos salvos (nome, comando, diretório, variáveis de ambiente, grupo, ícone).
   Executar em pty com terminal ao vivo (xterm.js), enviar input (ex.: senha SSH), parar, histórico de execuções com log.

### Propostas adicionais

- **Ações de longa duração ("serviços")**: marcar uma ação como _persistente_ (ex.: túnel) → status verde/vermelho, porta esperada,
  health-check por porta, auto-restart opcional e "parar" com um clique.
- **Parâmetros em ações**: `ssh -L {{localPort}}:db:5432 {{host}}` → formulário antes de executar.
- **Visão geral (Home)**: CPU/memória/load/disco do sistema em tempo real + ações favoritas + serviços ativos.
- **Importar aliases/funções** do `~/.zshrc`/`~/.bashrc` como ações.
- **Paleta de comandos (⌘K)** para executar ações e buscar processos.
- **Notificações** do sistema (via `osascript`) quando uma ação termina/falha ou disco passa do limite.
- **Exportar/importar** ações em JSON (versionar em dotfiles).
- Futuro: containers Docker, `launchctl`/brew services, bateria/temperatura.

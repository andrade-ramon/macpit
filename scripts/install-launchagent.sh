#!/usr/bin/env bash
# Instala o macpit como LaunchAgent: sobe ao fazer login no Mac (e reinicia se cair).
#
#   ./scripts/install-launchagent.sh              instala (ou reinstala) e inicia
#   ./scripts/install-launchagent.sh --uninstall  para e remove
#   ./scripts/install-launchagent.sh --status     mostra se está carregado
#   ./scripts/install-launchagent.sh --print      só imprime o plist (não altera nada)
#
# O launchd roda com PATH mínimo: o PATH e o SHELL atuais são gravados no plist para as ações
# acharem as mesmas ferramentas do seu terminal (Homebrew, nvm…). Mudou de versão do Node (nvm)?
# Rode este script de novo.
set -euo pipefail

LABEL="com.macpit.server"
# nome da época do bash-monitor: removido ao instalar/desinstalar
LEGACY_LABEL="com.bash-monitor.server"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA_DIR="${MACPIT_DATA_DIR:-$HOME/.macpit}"
DOMAIN="gui/$(id -u)"

xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }

plist() {
  local node="$1"
  local env_extra=""
  for var in MACPIT_PORT MACPIT_DATA_DIR MACPIT_SHELL MACPIT_SAMPLE_INTERVAL_MS MACPIT_DISK_SAMPLE_INTERVAL_MS; do
    if [ -n "${!var:-}" ]; then
      env_extra+="    <key>$var</key><string>$(printf '%s' "${!var}" | xml_escape)</string>"$'\n'
    fi
  done
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(printf '%s' "$node" | xml_escape)</string>
    <string>$(printf '%s' "$REPO/apps/server/dist/index.js" | xml_escape)</string>
  </array>
  <key>WorkingDirectory</key><string>$(printf '%s' "$REPO" | xml_escape)</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(printf '%s' "$PATH" | xml_escape)</string>
    <key>SHELL</key><string>$(printf '%s' "${SHELL:-/bin/zsh}" | xml_escape)</string>
    <key>NODE_ENV</key><string>production</string>
$env_extra  </dict>
  <key>RunAtLoad</key><true/>
  <!-- reinicia se cair; um encerramento limpo (launchctl bootout) não reinicia -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$(printf '%s' "$DATA_DIR/server.log" | xml_escape)</string>
  <key>StandardErrorPath</key><string>$(printf '%s' "$DATA_DIR/server.log" | xml_escape)</string>
</dict>
</plist>
PLIST
}

case "${1:-install}" in
  --print)
    plist "$(command -v node || echo /usr/local/bin/node)"
    exit 0
    ;;
  --status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|pid|last exit code) =' || true
    else
      echo "não instalado/carregado ($PLIST)"
    fi
    exit 0
    ;;
  --uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    launchctl bootout "$DOMAIN/$LEGACY_LABEL" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
    echo "✔ LaunchAgent removido. O macpit não sobe mais no login."
    exit 0
    ;;
  install | --install) ;;
  *)
    sed -n '2,11p' "$0"
    exit 1
    ;;
esac

if [ "$(id -u)" -eq 0 ]; then
  echo "✖ Não rode com sudo: o LaunchAgent é do seu usuário. (Para ações como root, use sudo ./scripts/start.sh manualmente.)" >&2
  exit 1
fi
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "✖ node não encontrado no PATH" >&2; exit 1; }
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' ||
  { echo "✖ precisa de Node 24+ (encontrado: $("$NODE" -v))" >&2; exit 1; }

# LaunchAgent com o nome antigo (bash-monitor): sai para não disputar a porta
if [ -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist" ]; then
  launchctl bootout "$DOMAIN/$LEGACY_LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
  echo "→ LaunchAgent antigo ($LEGACY_LABEL) removido"
fi

echo "→ build…"
(cd "$REPO" && pnpm build >/dev/null)
mkdir -p "$(dirname "$PLIST")" "$DATA_DIR"
chmod 700 "$DATA_DIR"
# o servidor imprime a URL com o token no stdout: o log precisa ser só seu (launchd criaria 0644)
touch "$DATA_DIR/server.log"
chmod 600 "$DATA_DIR/server.log"
plist "$NODE" >"$PLIST"
plutil -lint "$PLIST" >/dev/null

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "✔ Instalado: $PLIST"
echo "  Node: $NODE · logs: $DATA_DIR/server.log"
echo "  Abra o painel com: $REPO/scripts/open.sh"

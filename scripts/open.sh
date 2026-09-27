#!/usr/bin/env bash
# Abre o macpit no navegador já autenticado (lê o token de ~/.macpit/token).
set -euo pipefail
DATA_DIR="${MACPIT_DATA_DIR:-$HOME/.macpit}"
PORT="${MACPIT_PORT:-7777}"
TOKEN_FILE="$DATA_DIR/token"
[ -r "$TOKEN_FILE" ] || { echo "✖ token não encontrado em $TOKEN_FILE — o servidor já rodou alguma vez?" >&2; exit 1; }
if ! curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health" -H "Authorization: Bearer $(cat "$TOKEN_FILE")" 2>/dev/null; then
  echo "✖ servidor não responde em 127.0.0.1:$PORT (inicie com ./scripts/start.sh ou instale o LaunchAgent)" >&2
  exit 1
fi
open "http://127.0.0.1:$PORT/auth?token=$(cat "$TOKEN_FILE")"

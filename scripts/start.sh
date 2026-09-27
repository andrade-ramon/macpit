#!/usr/bin/env bash
# Sobe o dashboard. Rode com `sudo ./scripts/start.sh` para permitir ações que exigem root.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f apps/server/dist/index.js ] || pnpm build
if [ "$(id -u)" -eq 0 ]; then echo "⚠️  Rodando como ROOT — todas as ações executarão como root."; fi
exec node apps/server/dist/index.js "$@"

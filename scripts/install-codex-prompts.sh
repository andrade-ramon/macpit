#!/usr/bin/env bash
# Instala os roteiros de docs/agents/ como prompts do Codex (ficam em ~/.codex/prompts, que é por usuário).
# No Codex: /prompts:macpit-implement-feature, /prompts:macpit-update-docs, /prompts:macpit-security-review.
#
#   ./scripts/install-codex-prompts.sh             cria/atualiza os links
#   ./scripts/install-codex-prompts.sh --uninstall remove
#
# São links simbólicos: editar docs/agents/*.md já atualiza os prompts.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${CODEX_HOME:-$HOME/.codex}/prompts"
NAMES=(implement-feature update-docs security-review)

if [ "${1:-}" = "--uninstall" ]; then
  for n in "${NAMES[@]}"; do rm -f "$DEST/macpit-$n.md"; done
  echo "✔ prompts do macpit removidos de $DEST"
  exit 0
fi

mkdir -p "$DEST"
for n in "${NAMES[@]}"; do
  ln -sfn "$REPO/docs/agents/$n.md" "$DEST/macpit-$n.md"
  echo "✔ /prompts:macpit-$n → docs/agents/$n.md"
done
echo "Reinicie o Codex para ele carregar os prompts."

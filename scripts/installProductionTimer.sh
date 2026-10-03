#!/usr/bin/env bash
# Installs units only. Deliberately does not start production writes.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$ROOT" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Use a checkout path without spaces or special characters.' >&2; exit 1; }
[[ ! -f "$ROOT/.env.local" ]] || { echo 'Use a separate production checkout, not the lab checkout.' >&2; exit 1; }
RUNTIME="${1:-$HOME/rotations-linux-lab}"
[[ "$RUNTIME" =~ ^/[a-zA-Z0-9_./-]+$ ]] || exit 1
[[ -x "$RUNTIME/tools/wine-11.18-staging-amd64-wow64/bin/wine" ]] || { echo "Wine runtime not found." >&2; exit 1; }
cd "$ROOT"
node scripts/productionRun.mjs check
[[ -f .env.proxy.local ]] || { echo "Private tunnel configuration missing." >&2; exit 1; }
install -d -m 700 "$HOME/.config/systemd/user"
for unit in deploy/linux-production/*; do
    sed "s|@ROOT@|$ROOT|g; s|@RUNTIME@|$RUNTIME|g" "$unit" > "$HOME/.config/systemd/user/$(basename "$unit")"
done
systemctl --user daemon-reload
echo 'Installed, not enabled. Complete the cutover checklist before starting rotations-production-direct.service.'

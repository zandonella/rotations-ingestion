#!/usr/bin/env bash
# Installs only lab units. Does not configure a production database or scheduler.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$ROOT" == "$HOME/rotations-linux-lab/rotations-ingestion" ]] || {
    echo 'These units require the existing ~/rotations-linux-lab layout.' >&2
    exit 1
}
systemd-analyze --user verify "$ROOT"/deploy/linux-lab/*.service "$ROOT"/deploy/linux-lab/*.timer
install -d -m 700 "$HOME/.config/systemd/user"
for unit in "$ROOT"/deploy/linux-lab/*.service "$ROOT"/deploy/linux-lab/*.timer; do
    install -m 644 "$unit" "$HOME/.config/systemd/user/$(basename "$unit")"
done
systemctl --user daemon-reload
systemctl --user enable --now rotations-lab-riot.service rotations-lab-direct.timer
echo 'Lab timer enabled at :00 and :30 UTC. Run systemctl --user start rotations-lab-direct.service for a manual refresh.'

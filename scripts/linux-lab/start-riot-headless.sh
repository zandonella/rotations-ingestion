#!/usr/bin/env bash
set -euo pipefail
LAB_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export WINEPREFIX="$LAB_DIR/wine/prefix"
export WINEDEBUG=-all
export TMPDIR="$LAB_DIR/tmp"
export LIBGL_ALWAYS_SOFTWARE=1
exec xvfb-run -a "$LAB_DIR/tools/wine-11.18-amd64-wow64/bin/wine" \
  "$WINEPREFIX/drive_c/Riot Games/Riot Client/RiotClientServices.exe" --headless

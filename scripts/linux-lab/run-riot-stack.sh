#!/usr/bin/env bash
# Start Xvfb :107 + Riot Client backend (--headless) + Electron UI under a chosen Wine build.
# Usage: tools/run-riot-stack.sh [wine-dir-name]   (default: wine-11.18-staging-amd64-wow64)
set -euo pipefail
LAB="${ROTATIONS_LAB_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)}"
WINEDIR="$LAB/tools/${1:-wine-11.18-staging-amd64-wow64}"
export WINEDLLOVERRIDES="mscoree,mshtml=" DISPLAY=:107 WINEPREFIX="$LAB/wine/prefix" WINEDEBUG="${WINEDEBUG:--all}" TMPDIR="$LAB/tmp" LIBGL_ALWAYS_SOFTWARE=1
"$WINEDIR/bin/wineserver" -k 2>/dev/null || true
sleep 1
pgrep -f 'Xvfb :107' >/dev/null || { Xvfb :107 -screen 0 1280x800x24 -nolisten tcp -fbdir "$LAB/wine" >"$LAB/logs/xvfb.log" 2>&1 & sleep 1; }
WINE_USER="${ROTATIONS_WINE_USER:-$(id -un)}"
LOCK="$WINEPREFIX/drive_c/users/$WINE_USER/AppData/Local/Riot Games/Riot Client/Config/lockfile"
rm -f "$LOCK"
"$WINEDIR/bin/wine" "$WINEPREFIX/drive_c/Riot Games/Riot Client/RiotClientServices.exe" --headless >"$LAB/logs/stack-backend.log" 2>&1 &
for i in $(seq 240); do [[ -s "$LOCK" ]] && break; sleep 1; done
[[ -s "$LOCK" ]] || { echo 'Riot Client did not create its lockfile within 240 seconds.' >&2; exit 1; }
IFS=: read -r _ pid port pw _ <"$LOCK" || true
[[ "$port" =~ ^[0-9]+$ && -n "$pw" ]] || { echo 'Riot Client lockfile is invalid.' >&2; exit 1; }
echo "backend up on port $port"
exec "$WINEDIR/bin/wine" "$WINEPREFIX/drive_c/Riot Games/Riot Client/RiotClientElectron/Riot Client.exe" \
  --appPort="$port" --remotingAuthToken="$pw" --appPid="$pid" \
  "--userDataRoot=C:/users/$WINE_USER/AppData/Local/Riot Games/Riot Client" \
  "--logDir=C:/users/$WINE_USER/AppData/Local/Riot Games/Riot Client/Logs" \
  --enableHardwareAcceleration=false --no-sandbox --disable-gpu ${EXTRA_ARGS:-} >"$LAB/logs/stack-ui.log" 2>&1

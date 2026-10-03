#!/usr/bin/env bash
# Production runner: separate checkout and .env.linux.prod required.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
node scripts/productionRun.mjs check
mkdir -p data/run
chmod 700 data/run
exec 9>data/run/direct.lock
if ! flock -n 9; then
    echo 'A production direct run is already active; skipping overlap.'
    exit 0
fi

export INGESTION_POLL_INTERVAL_MINUTES=30
export RIOT_CLIENT_LOCKFILE="${RIOT_CLIENT_LOCKFILE:-$ROOT/../wine/prefix/drive_c/users/$(id -un)/AppData/Local/Riot Games/Riot Client/Config/lockfile}"

write_status() {
    node --input-type=module - "$1" "$2" <<'JS'
import fs from 'node:fs';
let previous = {};
try { previous = JSON.parse(fs.readFileSync('data/run/direct-status.json', 'utf8')); } catch { /* first run */ }
const status = {
    status: process.argv[2], attempt: Number(process.argv[3]), updatedAt: new Date().toISOString(),
    lastResult: process.argv[2] === 'running'
        ? [previous.lastResult, previous.status].find(value => ['ok', 'error', 'interrupted'].includes(value)) ?? null
        : process.argv[2],
};
fs.writeFileSync('data/run/direct-status.json.tmp', JSON.stringify(status, null, 2), { mode: 0o600 });
fs.renameSync('data/run/direct-status.json.tmp', 'data/run/direct-status.json');
JS
    # A reporting outage must not prevent collection; the VPS detects stale signals.
    if ! node scripts/productionRun.mjs report-status; then
        echo 'WARNING: Could not publish Linux run status to Supabase; the VPS monitor will see an old or missing status.' >&2
    fi
}

trap 'write_status interrupted "$attempt"; exit 143' TERM INT
for attempt in 1 2 3; do
    write_status running "$attempt"
    echo "$(date -u +%FT%TZ) Production direct collection attempt $attempt/3"
    # Each attempt collects fresh data. A collector failure never runs processing.
    if timeout --kill-after=10s 180s node scripts/productionRun.mjs direct; then
        write_status ok "$attempt"
        exit 0
    else
        result=$?
        if (( result == 75 )); then
            write_status error "$attempt"
            echo 'Riot collection is paused; skipping retries. See data/run/riot-pause.json.' >&2
            exit 75
        fi
    fi
    if (( attempt < 3 )); then
        delay=$((attempt * 30))
        echo "Attempt $attempt failed; retrying in $delay seconds." >&2
        sleep "$delay"
    fi
done
write_status error "$attempt"
echo 'ERROR: Production direct ingestion failed after 3 attempts. See the service journal; next retry is the next half-hour tick.' >&2
exit 1

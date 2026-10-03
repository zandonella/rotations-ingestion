#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"
# This helper is intentionally tied to the isolated lab, never a linked project.
node --input-type=module - <<'JS'
import fs from 'node:fs';
if (!/^project_id = "rotations-linux-lab"$/m.test(fs.readFileSync('linux/supabase/config.toml', 'utf8'))) {
    throw new Error('This helper only starts the rotations-linux-lab project.');
}
JS
NETWORK=rotations-linux-lab-local
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
    docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 "$NETWORK" >/dev/null
fi
BINDING="$(docker network inspect "$NETWORK" --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}')"
[[ "$BINDING" == 127.0.0.1 ]] || { echo 'Lab network must bind published ports to loopback.'; exit 1; }
./node_modules/.bin/supabase --workdir linux start --network-id "$NETWORK"
# Disable the local copy of the production GitHub dispatch trigger before ingestion.
docker exec supabase_db_rotations-linux-lab psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c 'DROP TRIGGER IF EXISTS og_refresh_after_heartbeat ON public.ingestion_heartbeat;'
docker exec -i supabase_db_rotations-linux-lab psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < linux/migrations/20261002000000_linux_ingestion_status.sql
./node_modules/.bin/supabase --workdir linux status --output json | node --input-type=module -e '
import fs from "node:fs";
const status = JSON.parse(fs.readFileSync(0, "utf8"));
if (status.API_URL !== "http://127.0.0.1:55421" || !status.SERVICE_ROLE_KEY) throw new Error("Unexpected local Supabase configuration.");
fs.writeFileSync(".env.local", `INGESTION_LOCAL_ONLY=true\nSUPABASE_URL=${status.API_URL}\nSUPABASE_KEY=${status.SERVICE_ROLE_KEY}\n`, {mode: 0o600});
fs.chmodSync(".env.local", 0o600);
console.log("Wrote local-only database credentials to .env.local.");
'

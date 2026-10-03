# Linux production

The owner verified shops against the game and authorized production. A single
Docker container supervises Tailscale and Riot Client under Wine. Root supervises
the tunnel; Riot and ingestion run as UID 1000 with no capabilities. Firewall rules
install before Riot starts, permitting workload internet traffic only through
tailscale0. Both IPv4/IPv6 are filtered; direct Docker DNS forwarding is blocked.
The host and other devices retain their ordinary routes. Private .env files,
Wine sessions, network details, and database backups stay outside Git.

The systemd user timer runs full collection at :00/:30 UTC inside the container.
A process lock prevents overlap. Static catalog data refreshes once per UTC day
before collection. Three attempts have 180-second bounds and a 12-minute service
limit. Collection failure cannot process an old snapshot. DB writes are per-table
and can partially succeed. Runner status and processing heartbeats go to Supabase.
Riot Client still needs manual intervention for sign-in challenges.

HTTP 429 persists Retry-After (seconds or HTTP date; default one hour, minimum one
minute) in data/run/riot-pause.json. HTTP 401/403 persist a manual-review pause.
These exit 75 and stop immediate retries. Clear that file only after resolving
the issue. This controls Node collection, not Riot Client internal retries.
Routine success messages are disabled. Warnings/errors and remote monitoring
remain available. OG builds queue only when active sale content changes; dispatch
is asynchronous. API refresh hints are optional, with periodic API refresh as fallback.

## Initial setup

Use Node 24 and a separate production checkout; npm ci. Do not copy .env.local.
Copy .env.linux.prod.example to .env.linux.prod and configure production service-role
credentials, Riot lockfile, Discord, and optional API cache-refresh credentials.
Copy .env.proxy.example to .env.proxy.local and set the approved exit node, durable
Wine runtime root, and existing signed-in Docker Tailscale state volume. chmod 600
both files. Keep the runtime directory even if its name originally referred to a lab.

Verify a production backup, then explicitly apply these SQL files in order:

- linux/migrations/20261002000000_linux_ingestion_status.sql
- linux/migrations/20261002010000_deduplicate_og_refresh.sql

Do not replay the local schema or restore lab data. Stop old lab client/collector
units and experimental containers before reusing Wine or Tailscale state. Stop
Windows/Pi timers and pending wake/run jobs before the first production write.

```bash
docker compose --env-file .env.proxy.local -f docker-compose.production.yml up -d --build
bash scripts/installProductionTimer.sh
loginctl enable-linger "$USER"
systemctl --user start rotations-production-direct.service
journalctl --user -u rotations-production-direct.service -n 80 --no-pager
systemctl --user show rotations-production-direct.service -p Result -p ExecMainStatus
systemctl --user enable --now rotations-production-direct.timer
```

Verify production shops and heartbeat before enabling the timer. Full host reboot
needs a supervised check. The signed-in session survived supervised client restart.

## Operations

```bash
systemctl --user list-timers rotations-production-direct.timer
systemctl --user start rotations-production-direct.service
docker inspect rotations-ingestion-production --format '{{.State.Health.Status}}'
docker logs --tail 30 rotations-ingestion-production
```

Run through the systemd service to retain tunnel isolation and locking. Direct
host productionRun.mjs execution bypasses network isolation. Docker exec commands
must specify --user 1000:1000. To update, stop the timer and wait for/stop its active
service, pull main in the production checkout, npm ci, rebuild using compose,
reinstall units if needed, verify a manual run, then enable the timer.

## VPS monitoring cutover

Only ingestion and monitoring require main updates; frontend, API and email code
remain compatible. On the VPS, in the existing monitoring checkout:

```bash
git pull --ff-only origin main
cp .env .env.linux
chmod 600 .env.linux
printf '\nLINUX_POLL_INTERVAL_MINUTES=30\nHOST=0.0.0.0\nPORT=8080\n' >> .env.linux
docker compose stop monitor
docker compose -f docker-compose.linux.yml up -d --build
curl --fail http://127.0.0.1:8081/status
```

Confirm heartbeat, linuxRunner, siteUp and freshness. Keep old data/ backups;
Linux uses data-linux/. Update any old health-check proxy using port 8080 to 8081.
The Linux entry point has no Pi/WOL checks or wake calls.

## Rollback

Disable/stop rotations-production-direct.timer and stop its active service before
restoring Windows/Pi jobs. Stop the production runtime if abandoning Linux. On the
VPS stop the Linux monitor and start the original compose monitor. Preserve DB
history, Windows scripts and config. The additive status table and deduplicated
OG trigger remain Windows-compatible. Only one production writer may run.

## Validation

Residential exit-node collection succeeded with 9,458 catalog items, four Mythic
stores, two Sanctum banners and inactive Your Shop. The actual Riot runtime was
blocked from direct internet when exit-node selection was removed. A prior
nonresidential exit returned HTTP 403 on required startup config. Full host reboot
and an active Your Shop require ongoing operational validation.

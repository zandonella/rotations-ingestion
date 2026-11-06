# Linux ingestion deployment

The managed Linux setup runs Riot Client under Wine in a Docker container and schedules ingestion with systemd. Each hourly run refreshes CommunityDragon metadata, collects current shop data, processes rotations, publishes public API state, and triggers wishlist email delivery after success.

## Runtime and configuration

Use Node 24, Docker, systemd user services, and a separate deployment checkout without `.env.local`. Prepare a signed-in Wine runtime with `tools`, `wine`, `logs`, and `tmp` directories. The managed email integration expects the ingestion checkout at `<runtime-root>/production/rotations-ingestion` and the email checkout at `<runtime-root>/rotations-email`. The included runtime expects its Wine binary under `tools/wine-11.18-staging-amd64-wow64/bin/wine`. These templates require that runtime layout and are not a general Wine installer.

Copy `.env.linux.prod.example` to `.env.linux.prod` and `.env.proxy.example` to `.env.proxy.local`. Keep both files private.

| File | Settings |
|---|---|
| `.env.linux.prod` | Supabase service role credentials, an absolute Riot Client lockfile path, optional Discord settings, and API refresh settings. |
| `.env.proxy.local` | `RUNTIME_ROOT`, `EXIT_NODE`, and `TAILSCALE_STATE_VOLUME`. |
| `production/email.env` under the runtime root | Supabase credentials, SES credentials, a verified sender, and optional Discord settings for the email worker. |
| `production/ingestion.env` under the runtime root | Supabase and API refresh settings read by the email integration. |

The container supervises Tailscale and routes workload traffic through the configured exit node. The Wine runtime and saved client session persist outside the checkout. Sign-in challenges require manual intervention through Riot Client.

## Database and integrations

Install the schema migrations in `supabase/migrations/`, including public API state and catalog deltas, restricted publisher permissions, backend email batches, and unchanged-write handling. The Linux-specific migrations are separate.

```text
linux/migrations/20261002000000_linux_ingestion_status.sql
linux/migrations/20261002010000_deduplicate_og_refresh.sql
```

Use an existing database backup when preparing an upgrade. Do not restore development fixtures into a deployed database.

Configure the [email service](https://github.com/zandonella/rotations-email) beside the runtime and the [API service](https://github.com/zandonella/rotations-api) on its own host. Public API publication occurs after complete ingestion. Configured HTTP hints notify the API after complete Linux ingestion so it can confirm freshness and fetch any changed public content. Expose `/internal/refresh` and `/internal/email-data` only through the API's authenticated private ingress.

The [Linux monitor](https://github.com/zandonella/rotations-monitoring/blob/main/docs/linux.md) reads operational rows from Supabase. Set `LINUX_POLL_INTERVAL_MINUTES=60` and use the API's hourly fallback setting, `REFRESH_INTERVAL_MINUTES=60`.

## Start the services

The systemd account needs persistent Docker access and user lingering. Docker must start at boot. Set `RUNTIME_ROOT` in `.env.proxy.local` to the prepared runtime's absolute path and pass that same path to the installer.

```sh
npm ci
npm run linux:prod:check
chmod 600 .env.linux.prod .env.proxy.local
docker compose --env-file .env.proxy.local -f docker-compose.production.yml up -d --build
bash scripts/installProductionTimer.sh /path/to/runtime
loginctl enable-linger "$USER"
```

The configuration check makes no connections. The installer writes user units without enabling ingestion. It expects the email checkout at `<runtime-root>/rotations-email`.

Before starting Linux ingestion, stop other scheduled writers. Run one collection and inspect its result before enabling the timer.

```sh
systemctl --user start rotations-production-direct.service
systemctl --user show rotations-production-direct.service -p Result -p ExecMainStatus
journalctl --user -u rotations-production-direct.service -n 80 --no-pager
systemctl --user enable --now rotations-production-direct.timer
```

The timer runs hourly at `:01 UTC`. The service waits for container readiness, prevents overlapping runs, and allows up to three bounded collection attempts. Ordinary service failures retry after five minutes. Exit 75 preserves a Riot cooldown or manual-review pause until a later scheduled run.

## Processing and delivery behavior

Every attempt refreshes static metadata before collecting sales. A failed metadata stage stops dependent processing. Collection validates all shop inputs before replacing the saved snapshot. Database writes are per table and can partially succeed, so failed runs must be checked before retrying.

Successful runs publish a fresh completion marker in `data/run/email-pull.json`. The email service consumes each completed run once and records its own status. Failed attempts remove the previous marker. Logs remain in `data/logs` and are uploaded to the Supabase `logs` bucket.

Public API publication failure fails a managed run. An HTTP refresh-hint failure leaves the published state available for the API's hourly `:05 UTC` fallback. The API retains its last valid snapshot during refresh failures.

## Operations and recovery

```sh
systemctl --user list-timers rotations-production-direct.timer
systemctl --user status rotations-production-email.service
docker inspect rotations-ingestion-production --format '{{.State.Health.Status}}'
docker logs --tail 30 rotations-ingestion-production
```

Run ingestion through the systemd service to retain network isolation and locking. Direct host execution of the production runner bypasses the container's network isolation.

HTTP 429 records a retry deadline in `data/run/riot-pause.json`. HTTP 401 or 403 records a manual-review pause. Resolve the underlying rate limit or sign-in issue before clearing a manual pause. Riot updates, Wine compatibility, and sign-in challenges can require operator intervention.

For updates, stop the timer, finish or stop the active service, update the checkout and dependencies, rebuild the runtime, and reinstall units if needed. Verify a manual run before enabling the timer again. After a host restart, check Docker, the signed-in client, the timer, and one successful ingestion and email cycle.

For a return to Windows ingestion, follow [the switching guide](linux-migration.md).

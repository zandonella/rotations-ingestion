# Linux ingestion testing

Use the separate local Supabase stack from the [Linux setup guide](linux-ingestion.md). It keeps development data and external notifications separate from deployed services.

## Regression checks

```sh
npm test
npm run test:linux
```

The suites cover sale processing, client collection, direct API mapping, retries, configuration, status reporting, and public API publication with mocked dependencies.

For a database check, load the local static catalog first and run the following command.

```sh
npm run test:local-db
```

This check sends a synthetic HTTPS fixture through collection and processing into local Supabase. Its synthetic records remain in the local database. It checks the data path, not live Riot availability.

The email repository's `npm run test:local-db` separately checks queueing, cached rendering, and delivery recording with synthetic fixtures and no SES delivery.

## Compare live data

Run `npm run local:direct` with a signed-in Riot Client, then compare the saved snapshot and local database with the League store.

- Check item identities, currencies, prices, and discounts.
- Check Mythic Shop sections, bundle contents, and offer end times.
- Check Sanctum banner identities and dates.
- Check Your Shop status and promotion dates when a window is active.

`data/source/clientSnapshot.json` records the collection timestamp and is replaced on each successful collection. Save a dated copy if needed for a comparison. A failed attempt can leave an older snapshot and partially processed database rows, so check the latest run result as well as the displayed offers.

## Optional local scheduling

The local systemd templates use the existing `rotations-lab-*` resource names. These are development units, separate from the `rotations-production-*` units.

The installer requires the checkout at `$HOME/rotations-linux-lab/rotations-ingestion` and a prepared Wine runtime beside it. It is tied to that directory layout. For other layouts, adapt the local unit templates under `deploy/linux-lab/`.

```sh
bash scripts/installLocalTimers.sh
loginctl enable-linger "$USER"
```

The local timer runs at `:00` and `:30 UTC`. The Riot service supervises the signed-in client. The runner prevents overlap and makes up to three attempts with 180-second limits and 30-second and 60-second retry delays. Each complete direct attempt refreshes static metadata before collecting rotations.

Run and inspect a scheduled refresh with these commands.

```sh
systemctl --user start rotations-lab-direct.service
systemctl --user show rotations-lab-direct.service -p Result -p ExecMainStatus
journalctl --user -u rotations-lab-direct.service -n 50 --no-pager
systemctl --user list-timers rotations-lab-direct.timer
```

`npm run local:refresh` runs the local wrapper directly. Runtime status is retained in `data/run/direct-status.json` and reported to the private `linux_ingestion_status` table.

Stop the timer to pause future runs. Stop the service separately if a run is already active.

```sh
systemctl --user stop rotations-lab-direct.timer
systemctl --user stop rotations-lab-direct.service
```

Managed deployments use an hourly timer at `:01 UTC`. See the [deployment guide](linux-production.md) for its separate runtime, configuration, and monitoring.

# Linux testing: half-hour polling

Local Supabase Studio is available on the tailnet at
`http://<ingestion-host-tailnet-name>:55423`. Keep the actual hostname and
address in private deployment configuration, not in this repository.
Studio and the database bind to loopback; `rotations-lab-studio.service` forwards
only the dashboard from the machine's Tailscale IPv4. It does not expose Postgres.
Stop dashboard forwarding with `systemctl --user stop rotations-lab-studio.service`.

The Linux lab uses a full shop fetch at **:00 and :30 UTC**, 48 scheduled runs
per day. A change can take up to 30 minutes to reach the database after Riot
exposes it, plus request/retry time. No Pi wakes or sale-boundary jobs are used.
The Riot Client stays running under Wine; each collection obtains the League
tokens it needs from that signed-in client.

This is the testing environment only. `scripts/localRun.mjs` forces loopback
Supabase, requires a fresh snapshot, and disables Discord, API refresh hints,
and wake calls. The local database's OG dispatch trigger must remain disabled
(the local Supabase setup helper removes it). Production credentials and the
Windows/Pi scheduler are not changed.

Linux implementations are separate: `getClientDataLinux.js`,
`processClientDataLinux.ts`, `processStaticDataLinux.ts`, `environmentSetupLinux.sh`,
and the `lib/*Linux` adapters. `getClientData.js`, `processClientData.ts`,
`serverScript.sh`, the original shared modules, and the locked dependencies remain
the main-branch legacy versions. The Windows auto-pull can continue to use its
original commands after a reviewed merge; selecting Linux requires explicit Linux
commands. No merge or push has been performed.

The lab Supabase project configuration lives in `linux/supabase/config.toml`.
`scripts/startLocalSupabase.sh` selects that workdir; manual CLI commands must use
`npx supabase --workdir linux ...`. The original `supabase/config.toml` is unchanged.

## Installed services

- `rotations-lab-riot.service`: runs the existing lab Wine/Xvfb stack, restarts
  when its main process exits, and starts at user-manager boot. Uses the existing
  signed-in Wine prefix. It does not automate account login or challenges.
- `rotations-lab-direct.timer`: persistent UTC half-hour timer. After downtime,
  systemd runs one catch-up job, not one job for every missed interval.
- `rotations-lab-direct.service`: `scripts/runLocalDirect.sh`, which takes a
  process lock and runs collection followed by local database processing. The
  processor runs only if collection succeeds. Up to three attempts, with 30s
  and 60s delays; each attempt has a 180s limit. The entire service has a 12-minute
  limit. A failed job stays visible as failed until a subsequent successful run.

User lingering is enabled on the test host so the services continue after SSH
logout and start without an interactive login. This has not yet been verified
with a full host reboot. Local Supabase containers have their existing Docker
restart policies; they must be running for ingestion to succeed.

Install/update these lab units from this repository:

```bash
bash scripts/installLocalTimers.sh
loginctl enable-linger "$USER"
```

The installer starts Riot Client if the service is not already running. The
first migration from a manually launched client restarts that client. After
editing its launcher or unit, restart it with
`systemctl --user restart rotations-lab-riot.service`.

## Manual validation

Force a fresh fetch and processing, using the same lock/retries as the timer:

```bash
systemctl --user start rotations-lab-direct.service
# Or, from the ingestion repository:
npm run local:refresh
```

The service command waits for completion. An overlapping manual/timer invocation
does not start a second ingestion. Check the result before comparing the store:

```bash
systemctl --user show rotations-lab-direct.service -p Result -p ExecMainStatus
journalctl --user -u rotations-lab-direct.service -n 50 --no-pager
cat data/run/direct-status.json
systemctl --user list-timers rotations-lab-direct.timer
```

The status file records running/ok/error/interrupted, attempt number, and time.
Collection failures leave the last successfully published source snapshot intact;
database failures can still leave partial updates because the existing writes
are not transactional. Do not treat an old snapshot or old heartbeat as evidence
that the latest attempt succeeded. Polling heartbeats expect the next :00/:30 tick.
Monitoring stays on the existing VPS alongside the frontend. The Linux runner
publishes operational status to Supabase's service-role-only
`linux_ingestion_status` table. The VPS monitor reads this and the processing
heartbeat every minute; it needs no files or inbound endpoint on this machine.
The local status JSON remains a debugging aid only. There is no monitor daemon
on the ingestion host.

The Linux status migration is in
`linux/migrations/20261002000000_linux_ingestion_status.sql`, outside the legacy
migration directory. The local setup helper applies it automatically. Production
application and VPS deployment remain pending. A one-shot local contract check
is available in the monitoring repo via `npm run check:linux:local`; see its
`docs/linux.md`.

Compare the test UI with the in-game store for item identities, prices, Mythic
sections, Sanctum banners and end dates, and Your Shop status. Active Your Shop
mapping and Sanctum date semantics still need this real-world validation.

`data/source/clientSnapshot.json` contains the latest successfully collected
input and its timestamp. It is overwritten atomically, not automatically archived.
Copy it to a dated file if preserving a particular comparison matters.

The half-hour job fetches catalog/store data and Sanctum banner definitions.
The full static cosmetic catalog remains a separate `npm run local:static`
operation; run it after a patch or when processing reports missing catalog items.
The separate lab public API normally refreshes its cache at :05/:35, so it can
lag the local database by another five minutes. The frontend's database reads
do not use that API cache.

Pause collection with `systemctl --user stop rotations-lab-direct.timer`.
That does not interrupt a run already in progress; stop
`rotations-lab-direct.service` too if needed. To disable lab startup entirely:

```bash
systemctl --user disable --now rotations-lab-direct.timer rotations-lab-riot.service
systemctl --user stop rotations-lab-direct.service
```

## Before production

Use the manual comparison period in place of Windows shadow comparisons while
Windows is unavailable. Production cutover still requires explicit production
configuration, moving off lab paths, and handling the increased frequency of
Discord status messages and heartbeat-triggered OG dispatches. Preserve a single
production writer. The separate Linux Supabase configuration remains lab-specific.

# Linux ingestion lab

For the installed half-hour test timer, supervised Riot Client, manual refresh,
and operational checks, see [Linux testing](linux-testing.md).

Work is on `codex/linux-ingestion-lab` in `/home/zando/rotations-linux-lab`.
Do not push to `main`: the production host automatically pulls it.
No production database, email sender, Discord hook, wake scheduler, or GitHub dispatch is needed here.

## What runs on Linux

- Static CommunityDragon downloads and all normalization/database writes.
- A native Node collector that talks to a signed-in League client's HTTPS API.
- The public API on Node 24. Frontend and email consumers use the same existing tables.
- Experimental remote store GETs using an exported, short-lived RSO session.

The collector no longer depends on Hasagi or Windows process discovery. Its only
client connection is `https://127.0.0.1:<port>` with credentials read from a lockfile.
For a client on another machine, use SSH forwarding. For Wine, point it at the
Wine installation's League lockfile. A Riot Client lockfile is **not** a League
Client lockfile: the shop routes belong to League.

## Start local Supabase

```bash
cd /home/zando/rotations-linux-lab/rotations-ingestion
npm ci
bash scripts/startLocalSupabase.sh
npm run local:static
```

The lab project is `rotations-linux-lab`; API port 55421 and database port 55422
bind to loopback through `rotations-linux-lab-local`. The helper writes private
local credentials to `.env.local` and drops the local heartbeat's GitHub trigger.
It never links a Supabase project or restores a production backup. Rerun the
helper after a local database reset, since resetting restores the trigger.

The `local:*` commands force local mode, refuse remote Supabase origins, disable
Discord, refresh hints, and wake scheduling, and do not inherit a database key
from the shell. Supabase redirects are rejected. Do not run the existing `prod:*`
commands, `serverScript.sh`, email sender, or backup/restore scripts in this lab.

## Option 0 (works): Riot services directly, no League client

`npm run local:direct` with `RIOT_CLIENT_LOCKFILE` pointing at a signed-in Riot
Client (under Wine in the lab). See `docs/linux-lab-handoff.md` for the flow.

## Option 1: Linux collector, signed-in Windows or Mac client

Requires SSH access to that machine and a signed-in League client with its store
loaded. Keep the League client running for collections. Example from Linux:

```bash
mkdir -p secrets
chmod 700 secrets
# Windows OpenSSH example; adjust host and install path.
scp 'league-host:C:/Riot Games/League of Legends/lockfile' secrets/league.lockfile
chmod 600 secrets/league.lockfile
# Read only the port (the third field), never print the password.
CLIENT_PORT=$(cut -d: -f3 secrets/league.lockfile)
ssh -N -o ExitOnForwardFailure=yes -L "127.0.0.1:29990:127.0.0.1:$CLIENT_PORT" league-host
```

In a second terminal:

```bash
LEAGUE_LOCKFILE="$PWD/secrets/league.lockfile" LEAGUE_LCU_PORT=29990 npm run local:client
```

On Mac the usual lockfile is
`/Applications/League of Legends.app/Contents/LoL/lockfile`.
Copy the lockfile again and recreate the tunnel after restarting League; its
port and password change. Only the loopback connection accepts the client's
self-signed certificate; internet TLS verification remains enabled.

## Option 2: Transfer data without transferring client credentials

Run the updated `node getClientDataLinux.js` on the machine running League, then copy
`data/source/clientSnapshot.json` to this clone's `data/source/` and run:

```bash
npm run local:process:client
```

This leaves all database access and processing on Linux. Use authenticated file
transfer and preserve the file unchanged. A snapshot more than 30 minutes old is
rejected by default. This mode needs no Riot token on the Linux host.

## Option 3: Direct remote store probe (experimental)

The shipped store UI reads `/lol-store/v1/getStoreUrl` and
`/lol-rso-auth/v1/authorization/access-token`, then sends bearer-authenticated GETs
such as `/storefront/v3/view/skins?language=en_US`. The utilities follow that flow;
they do not handle account passwords or perform automatic login/refresh attempts.

On a signed-in client host (or through the tunnel above):

```bash
node scripts/exportRiotSession.mjs secrets/riot.session.json
```

Transfer that private file to Linux, set mode 600, then:

```bash
node scripts/probeRiotStore.mjs secrets/riot.session.json
```

The probe saves raw responses under `data/probes`, never in the ingestion source
snapshot. Store page responses are not assumed to have the LCU catalog schema,
and they do not establish a replacement for Mythic Shop, Sanctum, or Your Shop.
Expired tokens and HTTP 401/403 stop the probe. Export a new session into a new
file; export intentionally refuses to overwrite an existing credential file.
An ordinary developer API key or third-party RSO identity token has not been
shown to grant these internal store scopes. No fully unattended token renewal
has been established.

## Option 4: Client under Wine

The lab contains portable Wine and the official Riot installer; no game or
anti-cheat binaries were modified. Runtime experiments and logs live in the
parent `tools/`, `wine/`, `research/`, and `logs/` directories. See
`docs/linux-lab-handoff.md` for current status, including failures.

When a signed-in **League** client is available under Wine:

```bash
LEAGUE_LOCKFILE='/home/zando/rotations-linux-lab/wine/prefix/drive_c/Riot Games/League of Legends/lockfile' npm run local:client
```

A responsive Riot launcher or visible login screen alone does not prove the
League store can load. Authentication and the actual four shop endpoints must
be validated before claiming this approach works unattended.

## Snapshot and processing behavior

`getClientDataLinux.js` now publishes one `clientSnapshot.json` only after all four
responses have been fetched and validated. A failed request exits nonzero and
leaves the last snapshot intact for inspection; the combined runner stops before
processing. The processor checks freshness and loads one input set before writes.
The standalone processor retains support for old individual JSON files; the
local runner requires the new snapshot and refuses that fallback.

Database writes still use the existing per-table upserts and are not a single
transaction. Partial database failures now exit nonzero. Local mode suppresses
external scheduling even if an end time occurs before the next daily refresh.

Configuration: `LEAGUE_LOCKFILE`, `LEAGUE_INSTALL_DIRECTORY`, `LEAGUE_LCU_PORT`,
`LEAGUE_CONNECTION_ATTEMPTS` (12), `LEAGUE_CONNECTION_DELAY_MS` (5000),
`LEAGUE_REQUEST_TIMEOUT_MS` (15000), `CLIENT_DATA_DIRECTORY`, and
`CLIENT_SNAPSHOT_MAX_AGE_SECONDS` (1800). All optional overrides are explicit;
credentials are not printed.

## Small checks

```bash
npm test                    # existing regression suite
npm run test:linux          # collector, mapping, and polling regression checks
npm run test:local-db       # one HTTPS fixture -> real local Supabase check
```

The database smoke check uses clearly synthetic offers, requires the static
catalog first, and leaves its rows in the local database. It does not demonstrate
live Riot access. Do not mistake the resulting API rotations for real shop data.

Stop the lab database with `npx supabase --workdir linux stop`; it preserves local data. The
separate API test container can be stopped with
`docker stop rotations-linux-lab-api`. To revoke the temporary Docker grant,
run `sudo setfacl -x u:zando /var/run/docker.sock` in your own terminal.

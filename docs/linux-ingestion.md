# Linux ingestion setup

Linux ingestion supports direct collection through a signed-in Riot Client and collection through a running League client. Both produce a validated snapshot for the Linux processor and use the same catalog and rotation schema as Windows ingestion.

Use Node 24, npm, Docker, and Bash. For managed deployment, use the [Linux deployment guide](linux-production.md).

## Start the local database

Run these commands from the ingestion checkout.

```sh
npm ci
bash scripts/startLocalSupabase.sh
npm run local:static
```

The helper starts a separate Supabase instance, applies the local status and email migrations, and writes credentials to `.env.local`. Its API listens at `127.0.0.1:55421`, Postgres at `127.0.0.1:55422`, and Studio at `127.0.0.1:55423`.

The `local:*` commands require loopback Supabase, disable Discord notifications, HTTP refresh hints, and wake scheduling, and use credentials from `.env.local`. The helper also removes the local heartbeat's GitHub dispatch trigger. Rerun it after resetting the local database.

## Direct collection with Riot Client

Start Riot Client under Wine and sign in. Set `RIOT_CLIENT_LOCKFILE` to its lockfile, then run a complete metadata and rotation refresh.

```sh
RIOT_CLIENT_LOCKFILE=/path/to/riot-client/lockfile npm run local:direct
```

Use `npm run local:collect:direct` with the same variable to collect a snapshot without processing it. This workflow uses Riot Client's signed-in session and does not require the League client or game to run. The [direct API reference](riot-direct-api.md) describes authentication, mapping, and limitations.

## Collection with the League client

For a running League client with its store loaded, set `LEAGUE_LOCKFILE` to the League installation lockfile.

```sh
LEAGUE_LOCKFILE=/path/to/league/lockfile npm run local:client
```

A Riot Client lockfile and a League client lockfile belong to different APIs. Use the variable for the selected collection method.

For a client on another machine, forward its loopback API over SSH. Store a private copy of the current lockfile locally and set `LEAGUE_LCU_PORT` to the forwarded port. Recopy the lockfile and recreate the tunnel after restarting the client because its port and password change.

You can also run `node getClientDataLinux.js` on the client machine, transfer `data/source/clientSnapshot.json`, and process it on Linux.

```sh
npm run local:process:client
```

## Snapshot and configuration

Collection writes `data/source/clientSnapshot.json` atomically after validating all four shop inputs. Failed collection leaves the previous snapshot intact and stops the combined run before processing. The default maximum snapshot age is 30 minutes. Database writes happen per table, so a processing failure can leave partial updates.

| Variable | Purpose |
|---|---|
| `RIOT_CLIENT_LOCKFILE` | The signed-in Riot Client lockfile for direct collection. |
| `LEAGUE_LOCKFILE` | The League client lockfile for client collection. |
| `LEAGUE_LCU_PORT` | The forwarded League client API port, when using a tunnel. |
| `CLIENT_DATA_DIRECTORY` | An alternate input and snapshot directory. |
| `CLIENT_SNAPSHOT_MAX_AGE_SECONDS` | The maximum accepted snapshot age, defaulting to 1800 seconds. |

See [Linux testing](linux-testing.md) for regression checks and optional local scheduling. Stop the local database with `npx supabase --workdir linux stop`.

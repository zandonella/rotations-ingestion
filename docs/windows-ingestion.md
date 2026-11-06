# Windows ingestion setup

The Windows workflow reads shop data from a running League client through Hasagi. Static metadata comes from CommunityDragon. These scripts share the Supabase schema with the [Linux workflow](linux-ingestion.md).

Use Node 24, npm, Docker for local Supabase, and Git Bash or another Bash-compatible shell.

## Local database

```sh
npm ci
npx supabase start
npx supabase db reset
npx supabase status
```

Create `.env` with the local API URL and service role key reported by Supabase.

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local service_role key>
```

Optional `DISCORD_WEBHOOK_URL` and `DISCORD_MENTION_ROLE_ID` settings enable issue notifications. Routine successful runs are quiet.

## Collect and process

Load the static catalog, then open League and wait for the store to load.

```sh
bash environmentSetup.sh
node getClientData.js
node processClientData.ts
```

`environmentSetup.sh` downloads metadata into `data/source/` and processes it. `getClientData.js` writes separate shop response files. `processClientData.ts` updates catalog sales, Mythic offers, Sanctum banners, and Your Shop windows, deactivates expired sales, and records a heartbeat.

## Automatic client startup

```sh
bash serverScript.sh
```

The wrapper starts Riot Client, waits for launch readiness, requests League startup, collects shop data, and processes the result. An outer Windows startup wrapper handles full retries and process cleanup after client or store-readiness failures.

To check startup without collecting or processing data, use the following command.

```sh
RIOT_LAUNCH_ONLY=true bash serverScript.sh
```

## Configuration and failures

| Setting | Default or behavior |
|---|---|
| `LEAGUE_INSTALL_DIRECTORY` | `C:\Riot Games\League of Legends`. |
| `LEAGUE_CONNECTION_ATTEMPTS` | 12 connection attempts. |
| `LEAGUE_CONNECTION_DELAY_MS` | 5000 milliseconds between attempts. |
| `RIOT_LAUNCH_TIMEOUT_SECONDS` | 300 seconds for launch readiness. |

The collector reads the installation lockfile directly. Exit code 20 means the client connection failed, and 21 means the stores did not become ready. HTTP 423 from the Riot launch request means a launch is already in progress.

Production processor commands read `.env.prod`.

```sh
npm run prod:process:static
npm run prod:process:client
```

Both shell scripts resolve their own directories. Stop local Supabase with `npx supabase stop`. See the [switching guide](linux-migration.md) before changing the scheduled ingestion setup.

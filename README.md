# Rotations.lol ingestion

Collects League of Legends cosmetic metadata and shop rotations for [Rotations.lol](https://rotations.lol). CommunityDragon supplies the catalog, and Riot shop data supplies skin sales, Mythic Shop offers, Sanctum banners, and Your Shop windows.

This repository includes both Windows and Linux setups. They write to the same Supabase schema, and each has its own collection scripts and configuration.

## Choose a setup

| | Windows | Linux |
|---|---|---|
| Collection | Reads the running League client through Hasagi. | Uses a signed-in Riot Client under Wine to collect directly from Riot services. A separate League client collector is also available. |
| Main scripts | `getClientData.js` and `processClientData.ts` | `scripts/collectDirect.mjs` and `processClientDataLinux.ts` |
| Saved data | Separate shop JSON files. | One validated `clientSnapshot.json`. |
| Automation | `serverScript.sh` launches the client and runs ingestion. | Docker supervises Riot Client and systemd schedules ingestion. |
| Configuration | `.env` for development and `.env.prod` for production processors. | `.env.local` for development and `.env.linux.prod` for deployment. |

Use Node 24, npm, Docker for local Supabase, and a Bash-compatible shell. Live collection requires a signed-in client session.

## Windows setup

Install dependencies and start a local database.

```sh
npm ci
npx supabase start
npx supabase db reset
npx supabase status
```

Create `.env` with the local credentials reported by Supabase.

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local service_role key>
```

Load the static catalog, then open League and wait for the store to load before collecting rotations.

```sh
bash environmentSetup.sh
node getClientData.js
node processClientData.ts
```

For automatic client startup and collection, use `bash serverScript.sh`. See the [Windows guide](docs/windows-ingestion.md) for installation paths, connection settings, and troubleshooting.

## Linux setup

Start the separate local Supabase stack and load the catalog.

```sh
npm ci
bash scripts/startLocalSupabase.sh
npm run local:static
```

The helper writes local database credentials to `.env.local`. Local commands use the database at `127.0.0.1:55421` and disable Discord notifications, wake scheduling, and HTTP refresh hints.

For direct collection, set `RIOT_CLIENT_LOCKFILE` to a signed-in Riot Client lockfile. Riot Client can run under Wine.

```sh
RIOT_CLIENT_LOCKFILE=/path/to/riot-client/lockfile npm run local:direct
```

For collection through a running League client, set `LEAGUE_LOCKFILE` instead.

```sh
LEAGUE_LOCKFILE=/path/to/league/lockfile npm run local:client
```

See the [Linux setup guide](docs/linux-ingestion.md) for client access options and the [Linux deployment guide](docs/linux-production.md) for Docker, systemd, configuration, and operations. The included production timer runs hourly at `:01 UTC`.

## Data and checks

Database migrations live in `supabase/migrations/`. Both workflows normalize the catalog, update rotations, and deactivate expired sales. Successful complete ingestion publishes public API cache revisions. The managed Linux deployment also triggers wishlist email delivery.

Run the regression suites with the following commands.

```sh
npm test
npm run test:linux
```

## Related projects

- The [web app](https://github.com/zandonella/rotations-lol) displays rotations and wishlists.
- The [public API](https://github.com/zandonella/rotations-api) serves cached catalog and rotation data.
- The [email service](https://github.com/zandonella/rotations-email) sends wishlist notifications.
- [Monitoring](https://github.com/zandonella/rotations-monitoring) checks ingestion and data freshness.

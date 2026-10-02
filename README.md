# rotations-ingestion

> Linux experiment: see [the local-only setup and client access options](docs/linux-ingestion.md),
> [the Riot direct API flow](docs/riot-direct-api.md), and [the migration plan](docs/linux-migration.md).
> This branch is for the isolated lab; do not push it to `main`.
> The collector now writes one atomic `data/source/clientSnapshot.json`; instructions below
> describing separate client JSON files and Hasagi are the original Windows workflow.


**Data ingestion for [Rotations.lol](https://rotations.lol), a League of Legends cosmetic wishlist and rotation tracker.**

Rotations.lol helps players wishlist League cosmetics and get notified when those items appear in a weekly sale, limited rotation, or the Mythic Shop. This repo powers the data side of that experience: it keeps the shared Supabase database current with a normalized cosmetic catalog and the latest live shop rotations.

The ingestion pipeline pulls from two sources:

- CommunityDragon for static cosmetic metadata, including skins, chromas, champions, skinlines, universes, emotes, icons, wards, finishers, and image URLs.
- The League client for live store data, including current Mythic Shop offers, weekly sales, and limited-time catalog availability.

Those raw sources are transformed into application-ready tables used by the Rotations.lol frontend and email notification pipeline.

## How It Fits

Rotations.lol is split across a few focused pieces:

- The main app lets users browse cosmetics, view active rotations, and manage wishlists.
- This ingestion repo keeps catalog and rotation data fresh.
- The email pipeline matches new rotations against user wishlists and sends notifications.

This project is intentionally small and script-driven. Most of the work is fetching source data, normalizing it into stable records, and writing those records to Supabase.

## Prerequisites

- Node.js 22 or newer
- npm
- Docker Desktop, required by the local Supabase stack
- League of Legends / Riot Client, required for live client data
- Git Bash, WSL, or another Bash-compatible shell for the `.sh` scripts

The Supabase CLI is installed as a dev dependency, so use it through `npx supabase`.

## Local Database Setup

Install dependencies:

```sh
npm install
```

Start the local Supabase stack:

```sh
npx supabase start
```

Apply migrations and seed the local database:

```sh
npx supabase db reset
```

Check local Supabase URLs and keys:

```sh
npx supabase status
```

Create a `.env` file in the project root:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local service_role key from npx supabase status>
DISCORD_WEBHOOK_URL=<optional Discord webhook URL for processing alerts>
DISCORD_MENTION_ROLE_ID=<optional Discord role ID to mention on warnings and errors>
```

Use the local `service_role` key for development script runs because these scripts write and upsert Supabase data.
`DISCORD_WEBHOOK_URL` enables one final Discord status message for each processing run, covering errors, warnings, or successful all-clear runs.
`DISCORD_MENTION_ROLE_ID` pings a Discord role on warning and error messages, but not all-clear messages.

When you are done with local development, stop Supabase:

```sh
npx supabase stop
```

## Development Workflow

Run the static data setup first. This refreshes catalog and asset data from CommunityDragon into `data/source`, then processes it into Supabase:

```sh
bash environmentSetup.sh
```

For live rotation data, open the League client and let it load far enough for the store to become available. Then pull the current client data:

```sh
node getClientData.js
```

Process the saved client JSON into Supabase:

```sh
node processClientData.ts
```

For the deployment-style flow, use:

```sh
bash serverScript.sh
```

`serverScript.sh` starts Riot Client, waits for its authenticated local API to report that League is launch eligible, and sends the same product-launch request as Riot Client's Play button. It then pulls live rotation data and processes it. Client startup and store-load failures exit immediately so the Windows startup wrapper can terminate wedged Riot and League processes before retrying the complete run. The Riot Client readiness wait defaults to 300 seconds and can be changed with `RIOT_LAUNCH_TIMEOUT_SECONDS`.

The Riot launch request allows 30 seconds because Riot Client can take approximately 20 seconds to accept it. HTTP 423 means an earlier request already started the launch, so the script proceeds to League connection polling instead of repeatedly submitting duplicate requests.

To test only the new launch flow without reading client data or writing to Supabase, use:

```sh
RIOT_LAUNCH_ONLY=true bash serverScript.sh
```

## Scripts

| Script                 | What it does                                                                                                                                                 | Typical command                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `environmentSetup.sh`  | Downloads static CommunityDragon JSON quietly into `data/source`, fails on HTTP errors, then calls `processStaticData.ts` to update Supabase.               | `bash environmentSetup.sh`          |
| `getClientData.js`     | Connects to the open League client through its installation lockfile, waits for store readiness, then writes the live shop response files under `data/source`. | `node getClientData.js`             |
| `processStaticData.ts` | Reads static JSON from `data/source`, normalizes champions, universes, skinlines, cosmetics, and image URLs, then upserts static catalog data into Supabase. | `node processStaticData.ts`         |
| `processClientData.ts` | Reads stored client JSON, processes live catalog sales and Mythic Shop sales, deactivates expired sales, and schedules the next refresh when needed.         | `node processClientData.ts`         |
| `serverScript.sh`      | Server/deployment script that launches League through Riot Client's local API, collects client data once, then runs `processClientData.ts`. The Windows startup wrapper owns retries and process cleanup. | `bash serverScript.sh`              |
| `uploadLogFile.ts`     | Uploads a local log file to the Supabase `logs` storage bucket.                                                                                              | `node uploadLogFile.ts <file-path>` |

## Notes

- Both shell scripts resolve their own directories and can run from any working directory.
- `getClientData.js` reads and validates `C:\Riot Games\League of Legends\lockfile` directly, then passes its credentials to Hasagi using manual authentication. This avoids the broken lockfile path reader in `@hasagi/core` 0.6.9. Set `LEAGUE_INSTALL_DIRECTORY` when League is installed elsewhere. Connection polling is limited to 12 attempts at 5 seconds by default. Set `LEAGUE_CONNECTION_ATTEMPTS` or `LEAGUE_CONNECTION_DELAY_MS` to change those limits.
- `processClientData.ts` expects `data/source/catalog.json` and `data/source/mythicShop.json` to already exist. Generate them with `getClientData.js`.
- `processStaticData.ts` expects the CommunityDragon JSON files generated by `environmentSetup.sh`.
- Synthetic alternate-mode champions whose IDs exceed the database champion range, including CommunityDragon's `Jade_*` records, and their associated skins are excluded from the live cosmetic catalog.
- Production commands in `package.json` use `.env.prod`:

```sh
npm run prod:process:static
npm run prod:process:client
```

Add `DISCORD_WEBHOOK_URL` and `DISCORD_MENTION_ROLE_ID` to `.env.prod` as well if production processing should report to Discord.

## Related Projects

- Main app: [rotations.lol](https://rotations.lol)
- Frontend repo: [rotations-lol](https://github.com/zandonella/rotations-lol)
- Email pipeline: [rotations-email](https://github.com/zandonella/rotations-email)

# rotations-ingestion

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
```

Use the local `service_role` key for development script runs because these scripts write and upsert Supabase data.

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

`serverScript.sh` launches League from the command line, retries known startup/store-load failures, pulls live rotation data, and processes it.

## Scripts

| Script                 | What it does                                                                                                                                                 | Typical command                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `environmentSetup.sh`  | Downloads static CommunityDragon JSON into `data/source`, including cosmetic info and image paths, then calls `processStaticData.ts` to update Supabase.     | `bash environmentSetup.sh`          |
| `getClientData.js`     | Connects to the open League client with `@hasagi/core`, waits for store readiness, then writes `data/source/mythicShop.json` and `data/source/catalog.json`. | `node getClientData.js`             |
| `processStaticData.ts` | Reads static JSON from `data/source`, normalizes champions, universes, skinlines, cosmetics, and image URLs, then upserts static catalog data into Supabase. | `node processStaticData.ts`         |
| `processClientData.ts` | Reads stored client JSON, processes live catalog sales and Mythic Shop sales, deactivates expired sales, and schedules the next refresh when needed.         | `node processClientData.ts`         |
| `serverScript.sh`      | Server/deployment script that launches League, retries client data collection on known exit codes, then runs `processClientData.ts`.                         | `bash serverScript.sh`              |
| `uploadLogFile.ts`     | Uploads a local log file to the Supabase `logs` storage bucket.                                                                                              | `node uploadLogFile.ts <file-path>` |

## Notes

- `environmentSetup.sh` and `serverScript.sh` currently contain a hardcoded `cd` path. Update that path for your local checkout or server deployment before running them.
- `processClientData.ts` expects `data/source/catalog.json` and `data/source/mythicShop.json` to already exist. Generate them with `getClientData.js`.
- `processStaticData.ts` expects the CommunityDragon JSON files generated by `environmentSetup.sh`.
- Production commands in `package.json` use `.env.prod`:

```sh
npm run prod:process:static
npm run prod:process:client
```

## Related Projects

- Main app: [rotations.lol](https://rotations.lol)
- Frontend repo: [rotations-lol](https://github.com/zandonella/rotations-lol)
- Email pipeline: [rotations-email](https://github.com/zandonella/rotations-email)

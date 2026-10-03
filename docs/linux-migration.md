# Linux migration and legacy compatibility

Linux is running in the isolated lab. No production database, deployed monitor,
Windows/Pi scheduler, or main branch has been changed. The owner selected full
shop collection at **:00 and :30 UTC**, with manual in-game comparisons while
Windows is unavailable. See [Linux testing](linux-testing.md).

## Separate flows

| Component | Original Windows/Pi flow | Linux flow |
| --- | --- | --- |
| Launch / scheduling | `serverScript.sh`, external Windows wrapper and Pi wakes | Lab Riot service and half-hour systemd timer |
| Client collector | `getClientData.js` with Hasagi | `scripts/collectDirect.mjs`; optional LCU collector `getClientDataLinux.js` |
| Client processing | `processClientData.ts`, four individual source files | `processClientDataLinux.ts`, validated atomic snapshot |
| Static processing | `environmentSetup.sh`, `processStaticData.ts` | `environmentSetupLinux.sh`, `processStaticDataLinux.ts` |
| DB / notifications | Original `lib/supabase.ts`, logger and refresh helper | Separate `lib/*Linux` adapters with local guards |
| Supabase CLI project | Original `supabase/config.toml` | `linux/supabase/config.toml`, selected with `--workdir linux` |
| Monitor | Original `rotations-monitoring` `npm start` and Pi checks | Separate `npm run start:linux` on the existing VPS |

Original ingestion files, existing package commands and dependency versions are
preserved from the main baseline. The Linux changes are opt-in. The Windows
machine can keep its current auto-pull and command sequence after a reviewed
merge; pulling the repository does not enable any Linux service or change the
Windows flow. No merge or push has been performed. Windows itself has not been
run in this Linux environment.

## What is now installed in the lab

- Supervised Riot Client under wine-staging, retaining its saved sign-in.
- Half-hour collection, a lock against overlapping runs, bounded attempts and
  retries, and heartbeat deadlines matching the polling schedule.
- Database reporting of runner attempts/failures for `rotations-monitoring` on
  the existing VPS. The local monitor was removed; one-shot contract checks use
  the local database. See the monitoring repo's `docs/linux.md`.
- Strict failure on missing Your Shop configuration and unmatched active Sanctum
  banner definitions. Collection failure preserves the prior source snapshot.

Sign-in survived a supervised Wine/Riot restart. Multi-day operation, a full host
reboot, Sanctum date semantics, and active Your Shop still require validation.

## Before production cutover

1. Complete manual comparisons of item identities, prices, Mythic sections,
   Sanctum dates, and Your Shop windows with the in-game store.
2. Prepare explicitly Linux production configuration and stable runtime paths;
   the installed units and guarded commands are lab-specific.
3. Decide how to suppress repeated success notifications and unnecessary OG-image
   dispatches with 48 runs per day. Local testing currently suppresses these.
4. Configure the existing VPS monitor to use the separate Linux entry point and
   production heartbeat. Keep it on a separate host to detect Linux-host outages.
   Apply the separate Linux status migration to the shared production database;
   the VPS reads early collection failures from that table without filesystem access.
5. Disable Windows/Pi ingestion scheduling before enabling the Linux production
   timer. Keep the original scripts and scheduler available for rollback.

Run only one ingestion flow against production at a time. Unchanged Windows
commands do not make simultaneous production writers safe. Database writes
remain per-table operations, not an atomic transaction.

## Rollback

Stop the Linux production timer and any active run, then restore the original
Windows/Pi scheduling. The legacy files remain available on main after the
additive Linux changes are merged. A release tag can still identify the exact
previous deployment, but switching away from main is not required by this split.

Production rollout instructions: [Linux production cutover](linux-production.md).

Production uses docker-compose.production.yml with an isolated exit-node connection; see docs/linux-production.md. The earlier host-only Riot unit is superseded.

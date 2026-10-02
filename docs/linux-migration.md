# Moving ingestion from Windows + Pi to Linux

Status: **proposal**. The Linux collector works against live data into a local
database (see `docs/riot-direct-api.md`). The production pieces described below
under "Phase 2" are not built yet, and nothing here has touched production.

## Today: Windows + Pi (legacy)

```
nebula (Pi, 100.99.1.41)                  polaris (Windows, 100.85.127.57)
 systemd timer, daily 00:00 UTC (5pm PDT)
 + one-off wakes from /schedule-wake  ──WOL──►  boots; startup wrapper pulls main
                                                serverScript.sh:
                                                  start Riot Client
                                                  product-launcher → launch League
                                                  getClientData.js  (LCU: 4 endpoints)
                                                  processClientData.ts → prod Supabase
                                                    ├ heartbeat → GitHub OG dispatch
                                                    ├ Discord status
                                                    └ POST nebula:3000/schedule-wake (if a sale ends before 00:00 UTC)
                                                wrapper handles retries, kills wedged processes, sleeps
```

Weak points: Wake-on-LAN and a full Windows boot for every run, League patches
and Vanguard on a headless machine, two machines that both have to be healthy,
and the startup wrapper living outside the repo.

## New: one Linux host, no League

```
aurora (Linux, always on)
  Riot Client under Wine, headless, signed in once ("Stay signed in")   ← long-running service
  timer at 00:00 UTC (+ one-off timers for sale end times)
    → collectDirect (riotDirect.js): lol token → League session → storefront + Shoppe + CDragon
    → processClientData.ts → prod Supabase (unchanged: heartbeat, Discord, OG dispatch, API hint)
```

| | Windows + Pi | Linux direct |
| --- | --- | --- |
| Machines | Pi scheduler + Windows box | One Linux host |
| Per run | WOL, boot, Riot Client, League launch, store load (minutes) | 4 HTTPS calls + 3 GETs (seconds) |
| League install / patches / Vanguard | Required | Not used |
| Riot Client | Started each run | Always running under Wine |
| Data source | LCU `/lol-store`, `/lol-shoppefront`, `/lol-sanctum`, `/lol-yourshop` | The services those LCU endpoints call (see API doc) |
| Processing, DB writes, heartbeat, Discord | `processClientData.ts` | Same file, unchanged |
| Sign-in | League client keeps the session | Riot Client "Stay signed in"; re-login needs a person (captcha) |
| Breaks when | WOL, boot, League patch, store load | Riot changes internal routes, Riot Client update breaks under Wine, session lost |

`processClientData.ts` doesn't know which collector ran. Both produce the same
validated `data/source/clientSnapshot.json`.

## Transition plan

### Phase 0: lab validation (done)

`npm run local:direct` collects live NA data into the lab's local Supabase.
Production is untouched, and the branch is `codex/linux-ingestion-lab`.

### Phase 1: shadow run (recommended 1–2 weeks)

Production stays on Windows + Pi. The Linux host runs the collector on the same
schedule but **only saves snapshots**, with no database writes:

- `npm run local:collect:direct` writes a dated snapshot copy at 00:05 UTC.
- Compare it with the Windows run's data in production (or with a Windows
  `clientSnapshot.json` if Windows is on this branch) for Mythic entries, sale
  item ids and Sanctum banners.
- Things to check during this phase:
  - [ ] The Riot Client stays signed in across restarts of Wine, the service and the host.
  - [ ] Sanctum dates match what the old collector stored.
  - [ ] Your Shop maps correctly while one is live.
  - [ ] The login queue never returns a wait instead of `LOGIN`.
  - [ ] A Riot Client update under Wine doesn't break the stack.

### Phase 2: build the production pieces (not done yet)

1. `prod:direct` script: `collectDirect` + `processClientData.ts` with `.env.prod`.
   This is the Linux equivalent of `serverScript.sh`.
2. Riot Client as a service: a `systemd --user` unit around `tools/run-riot-stack.sh`
   (Xvfb + wine-staging), restarted on failure, plus a health check
   (`GET /rso-auth/v1/authorization` returns 200) that alerts Discord when signed out.
3. Scheduling on the Linux host: a `systemd --user` timer at 00:00 UTC replaces
   the Pi's daily timer. `scheduleNextRefresh` gets a mode that runs
   `systemd-run --user --on-calendar=<sale end>` locally instead of POSTing to the
   Pi. Keep the Pi URL mode for the legacy path.
4. Retries: the Windows wrapper's role. Wrap the run so a failure retries a few
   times with backoff, then reports to Discord. The heartbeat already shows missed runs.
5. Move the lab pieces out of `/home/zando/rotations-linux-lab` into a stable
   location on the host (Wine prefix, tools, venv). Production must not depend on the lab folder.

### Phase 3: cutover

1. **Before merging anything to `main`:** tag the current production commit, for
   example `legacy-windows-v1`, and point the Windows box's auto-pull at that tag or
   a `legacy-windows` branch. That way a later merge to `main` can't change the backup.
2. Revert the lab-only `supabase/config.toml` change, then merge the Linux
   collector to `main`.
3. Disable the Pi's daily timer and `/schedule-wake` (leave them installed),
   then enable the Linux timer.
4. Watch heartbeat and Discord for a few days.

**Run only one pipeline against production at a time.** Upserts are idempotent,
but two schedulers would double the Discord messages, heartbeat writes and OG dispatches.

## Legacy backup (Windows + Pi)

Keep it installed but idle:
- The Windows box stays on the `legacy-windows-v1` tag, with League installed.
  Patch it occasionally if you want a fast failover.
- The Pi keeps its scheduler service. Only its timer is disabled.

**Failover** (the Linux path is broken and can't be fixed quickly):
1. Stop or disable the Linux timer.
2. Re-enable the Pi timer, or trigger a wake manually.
3. The Windows box runs `serverScript.sh` exactly as before.

**Switching back:** reverse the steps. The Linux collector needs the Riot Client
signed in; check `GET /rso-auth/v1/authorization` first.

Untested: this branch replaced Hasagi in `getClientData.js` with a small LCU
client, which should still work on Windows, but nobody has run it there. That's
why the backup should stay pinned to the pre-merge tag rather than tracking `main`.

## Risks

- **Riot ToS / account action:** this uses a dedicated account and only reads
  shop data, but it is unofficial use of internal endpoints. Losing the account
  means falling back to Windows.
- **Endpoint drift:** internal routes can change with any patch. The
  re-discovery playbook is in `docs/riot-direct-api.md`.
- **Riot Client under Wine:** vanilla Wine crashes the UI renderer; wine-staging
  11.18 works. An auto-update could break it.
- **Re-login needs a person:** an hCaptcha may appear. The terminal-only flow
  (`type-login.py` + screenshot + clicks) works from a phone.

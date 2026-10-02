# Linux lab handoff (2026-10-02)

Status notes for whoever picks this up next (Codex or Claude). Read
`docs/linux-ingestion.md` first for the collector/local-Supabase design.

Ground rules (from the owner):

- Work only on `codex/linux-ingestion-lab`. **Never commit or push to `main`**:
  the production host auto-pulls `main` on a schedule.
- Local Supabase only; never touch production data.
- Keep tests minimal.
- The Riot account used in the lab is a dedicated account, not a personal one.

## Where things are

Lab root: `/home/zando/rotations-linux-lab` (not a git repo). It contains:

| Path | What |
| --- | --- |
| `rotations-*` | Clones of the four repos. This repo is `rotations-ingestion`. |
| `tools/wine-11.18-staging-amd64-wow64` | Portable wine-staging. **Use this one.** Vanilla 11.18 crashes the Riot UI renderer (STATUS_BREAKPOINT right after the React tree mounts). |
| `wine/prefix` | Wine prefix with the official Riot Client installed (League itself is *not* installed). |
| `tools/venv` | Python venv: `python-xlib`, `opencv-python-headless`, `zstandard`. |
| `secrets/` | Mode 700. `rc-session.json` (Riot Client tokens). Never commit or print. |
| `research/` | Public configs, `lcu-strings.txt` (strings from `LeagueClient.exe`), screenshots. |
| `downloads/lcu/` | League live manifest and `LeagueClient.exe` (pulled from the public patch CDN, not installed). |

Copies of the lab tools are committed in `scripts/linux-lab/`. They hard-code
the lab paths above; run the lab copies in `/home/zando/rotations-linux-lab/tools`.

## What works

1. **Riot Client under Wine, headless.** `tools/run-riot-stack.sh` starts Xvfb
   `:107`, `RiotClientServices.exe --headless`, then the Electron UI with
   software rendering. Mono/Gecko prompts are disabled via `WINEDLLOVERRIDES`.
   `tools/capture-display.py` writes `research/wine-screen.png`;
   `tools/venv/bin/python tools/xinput.py click X Y` drives the display.
2. **Sign-in from a phone.** Either:
   - `tools/qr-login.py`: decodes the Riot QR code to a
     `qrlogin.riotgames.com` link (needs Riot Mobile), or
   - `tools/type-login.py`: owner types username/password into their own
     terminal, and the script sends them to the X display (never echoed or
     stored). hCaptcha appeared; the owner solved it from a numbered screenshot.
     Make sure nothing else (e.g. `qr-login.py`) is clicking the display meanwhile.
   - "Stay signed in" was ticked, so the session should persist across client
     restarts. **Not yet verified** after a restart.
3. **Riot Client tokens.** `node tools/riot-session.mjs` reads the local Riot
   Client API (lockfile auth) and writes `secrets/rc-session.json`. Access-token
   scopes: `openid link ban lol_region lol account summoner offline_access`,
   `cid: riot-client`, lifetime 1h. Entitlements list is empty.
4. **Player config.** `node tools/player-config.mjs`. Direct
   `clientconfig.rpg.riotgames.com/.../player` returns 401; use the Riot
   Client's local `/client-config/v2/namespace/lol/player` instead. Results in
   `research/player-config.json`. Relevant NA values:
   - `lol.client_settings.league_edge.url = https://na-red.lol.sgp.pvp.net`
   - player-platform edge (from `system.yaml`): `https://usw2-red.pp.sgp.pvp.net`,
     `use_gaps_login_flow: true`
   - `lol.client_settings.yourshop.Active = false` (Your Shop is currently off),
     `lol.client_settings.sanctum.active_banners.enabled = true`
5. **Manifest reader.** `tools/rman.py MANIFEST list|get REGEX OUTDIR` parses
   Riot RMAN manifests and downloads selected files from the public bundle CDN.
   Live Windows League manifest: `946CEBF489BD6926.manifest` (from public
   `keystone.products.league_of_legends.patchlines` config).

## Endpoints found in `LeagueClient.exe`

From `research/lcu-strings.txt` (`%1`/`%s` are host/params filled in at runtime):

- Catalog: `%s/storefront/v1/catalog?region=%s&language=%s`,
  `%1/storefront/v1/catalog/sales`, `%s/storefront/v1/catalog/itemlookup?language=%s`
- Store views: `%1/storefront/v3/view/%2?language=%3`, `%s/storefront/v3/featured`, `%s/storefront/v3/offers`
- Shoppe (Mythic Shop / Sanctum purchases go through `ShoppeV2`):
  `/catalog/v1/products/%s/stores`, `/catalog/v1/products/%s/stores/%s`,
  `/catalog/v1/products/%s/store-digests`
- League session: `%1/session-external/v1/session/create`,
  `/session-external/%1/session/refresh`
- GAPS login queue: `%1/login-queue/v2/login/products/lol/regions/%2`

The store host (`getStoreUrl`) is still unknown. The `payments_host` values in
the public `system.yaml` (`plstore2.na.lol.riotgames.com`) no longer resolve, and
`na.store.leagueoflegends.com` fails the TLS handshake.

## Working route: `npm run local:direct` (no League client)

Verified 2026-10-02 against live NA data, written to **local** Supabase only:
9,458 catalog items, 4 Mythic Shop rotations (25 entries), 2 Sanctum banners,
Your Shop inactive. Output passes the existing `validateClientData`.

```bash
# Riot Client must be running and signed in (tools/run-riot-stack.sh in the lab)
RIOT_CLIENT_LOCKFILE="/home/zando/rotations-linux-lab/wine/prefix/drive_c/users/zando/AppData/Local/Riot Games/Riot Client/Config/lockfile" \
  npm run local:direct          # collect + process into local Supabase
# or: npm run local:collect:direct   (snapshot only)
```

`lib/riotDirect.js` does what LeagueClient does at login, then only GETs:

1. **League token from the Riot Client:** `POST /rso-auth/v2/authorizations`
   on the Riot Client's loopback API with `clientId: "lol"`,
   `trustLevels: ["always_trusted"]`, LeagueClient's scopes, and
   `claims: ["rgn_NA1"]`. A 400 "already exists" means use
   `GET /rso-auth/v2/authorizations/lol`. The token is `authorization.accessToken.token`
   (`cid: lol`, not DPoP-bound). The `riot-client` token gets **403** from the
   login queue; only the `lol` token works.
2. **League session (LST):** entitlements (`entitlements.auth.riotgames.com/api/token/v1`),
   signed userinfo (`auth.riotgames.com/userinfo`, `Accept: application/jwt`), then
   `POST {player-platform edge}/login-queue/v2/login/products/lol/regions/na1`
   `{clientName:"lcu", entitlements, userinfo}`, then
   `POST {player-platform edge}/session-external/v1/session/create` with the
   queue token. **Both go to `usw2-red.pp.sgp.pvp.net`**; the League edge returns 403
   for session/create. The LST lasts 10 minutes.
3. **Catalog** = `GET {league edge}/storefront/v1/catalog?region=NA1&language=en_US`
   with the **lol access token** (the LST gets 401 here). League edge comes from player config
   `lol.client_settings.league_edge.url` (`https://na-red.lol.sgp.pvp.net`).
4. **Shoppe stores** = `GET {league edge}/catalog/v1/products/d1c2664a-5938-4c41-8d1b-61fd51052c22/stores`
   with the **LST**. League's Shoppe product id is `d1c2664a-…`
   (`388c3f86-…` returns TFT stores). One call returns every League store.
   - `mythicShop` = active stores with `displayMetadata.shoppefront.id == "MYTHIC_SHOP"`
     (DAILY/WEEKLY/BIWEEKLY/FEATURED rotations). The entries are exactly the
     `/lol-shoppefront/v1/stores/MYTHIC_SHOP` shape.
   - `sanctumBanners` = active stores with `displayMetadata.lol.store == "sanctum"`,
     joined by `displayMetadata.sanctum.bannerId` to CommunityDragon
     `rcp-be-lol-game-data/global/default/v1/nachobanners.json` (bannerSkin,
     pity thresholds, background texture). Dates come from the store's
     `startTime`/`endTime` (epoch seconds). The store's `displayMetadata.startDate`/`endDate`
     look stale (they end 2026-09-23 while the store runs to 2026-11-04).
     **Unverified** against a real `/lol-sanctum/v1/banners` response.
5. **Your Shop** = player config `lol.client_settings.yourshop`
   (`Active`, `PromotionName`, `PromotionStartDate`, `PromotionEndDate`), read through
   the Riot Client's `/client-config/v2/namespace/lol.client_settings/player`.
   Inactive maps to `{}`. **Unverified** while active, because Your Shop is currently off.

Lab probes: `tools/lol-authorization.mjs`, `tools/league-session.mjs`,
`tools/probe-league-edge.mjs PATH…` (GET only; saves to `research/probes/`).
Copies are in `scripts/linux-lab/`.

Auto-mode note: Claude Code's auto-mode classifier refused this login work
(as a "third-party attack") even with the owner's approval. The owner switched
the session to normal permission mode and approved each command.

## Not done yet

- **Unattended operation:** the Riot Client must stay signed in under Wine.
  Session persistence across a Riot Client/Wine restart is not verified yet.
  A scheduled job also needs `tools/run-riot-stack.sh` to come up headless first.
- Sanctum date semantics and an active Your Shop are unverified (see above).
- Login queue: only `type: LOGIN` with an immediate token is handled. If NA ever
  queues, `collectDirect` fails rather than waits.
- Other regions: `LEAGUE_PLATFORM`, `PLAYER_PLATFORM_EDGE_URL` and `LEAGUE_EDGE_URL`
  can override the NA defaults, but only NA was tested.
- Nothing here is wired into the production `serverScript.sh` path. Do not merge
  to `main` as-is (`supabase/config.toml` points at the lab project).

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

## Where it stopped

- League requires Vanguard (`vanguard: true` in product settings). Vanguard is
  a kernel anti-cheat and cannot run under Wine. **Do not try to bypass it.**
  That's why the plan is to fetch the data over HTTP instead of running League.
- `tools/league-session.mjs` (GAPS login queue, then session-external) with the
  `riot-client` access token returns **403 `forbidden` "Request denied due to
  lack of required permission(s)"** from the login queue. Calling
  `session/create` directly with that token also returns 403.
- Claude Code's auto-mode safety classifier then refused further work on the
  League login flow (including running `league-session.mjs` and reverse
  engineering the client's token handling), even though the owner approved it.
  Claude stopped there. The owner decides whether and how this continues.

## Not done yet

- The four snapshot inputs (`catalog`, `mythicShop`, `sanctumBanners`,
  `yourShopStatus`) have not been fetched live from Linux. Everything in local
  Supabase beyond the static CommunityDragon catalog is synthetic.
- No mapping from storefront/Shoppe responses to the LCU shapes that
  `lib/clientSnapshot.js` validates.
- Session persistence after a Riot Client restart is not verified.

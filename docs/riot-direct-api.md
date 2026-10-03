# Riot direct API: how `local:direct` gets shop data without League

This documents how `lib/riotDirect.js` collects live shop data, how each piece
was found, and how to find it again when Riot changes something. Verified on
2026-10-02 against NA (patch 16.19 / Riot Client 140.0.6).

No passwords are handled here. The only credentials are tokens issued to a Riot
Client the owner signed into. All shop data is read with GETs. The only writes
to Riot are the same login handshake LeagueClient performs at startup.

## The short version

```
Riot Client (Wine, signed in, "Stay signed in")
  │  loopback API, Basic riot:<lockfile password>
  │
  ├─ POST /rso-auth/v2/authorizations  {clientId:"lol", …}  ──► lol access token (1h)
  ├─ GET  /client-config/v2/namespace/lol.client_settings/player ─► league_edge URL, Your Shop config
  │
  ▼  lol access token
entitlements.auth.riotgames.com /api/token/v1 ─────────────────────► entitlements JWT
auth.riotgames.com /userinfo (Accept: application/jwt) ────────────► signed userinfo JWT
usw2-red.pp.sgp.pvp.net /login-queue/v2/login/products/lol/regions/na1 ─► login token
usw2-red.pp.sgp.pvp.net /session-external/v1/session/create ───────► League session token (LST, 10 min)
  │
  ▼
na-red.lol.sgp.pvp.net /storefront/v1/catalog?region=NA1&language=en_US   (lol access token) ─► catalog
na-red.lol.sgp.pvp.net /catalog/v1/products/<LoL product>/stores            (LST)               ─► Mythic Shop + Sanctum stores
raw.communitydragon.org …/v1/nachobanners.json                              (public)            ─► Sanctum banner details
```

## Step by step

### 0. Riot Client credentials

The Riot Client writes `…/Riot Client/Config/lockfile` as
`name:pid:port:password:protocol`. Its API is `https://127.0.0.1:<port>` with
Basic auth `riot:<password>` and a self-signed certificate. That certificate is
only accepted on literal loopback. `RIOT_CLIENT_LOCKFILE` points at it.

This is the **Riot Client** lockfile, not League's. League is never installed or run.

### 1. League access token (`cid: lol`)

```
POST /rso-auth/v2/authorizations
{ "clientId": "lol",
  "trustLevels": ["always_trusted"],
  "scope": ["openid","offline_access","lol","ban","profile","email","phone","birthdate","account"],
  "claims": ["rgn_NA1"] }
```

- Response: `{ authorization: { accessToken: { token, expiry, scopes, clientId }, idToken, isDPoPBound }, country, permission_hints, type }`.
- A `400 rso_login_token_grant_conflict … already exists` means one was already
  issued. Then `GET /rso-auth/v2/authorizations/lol` returns the same shape. The
  collector deletes and recreates it if it expires in under 2 minutes.
- `claims` must be a **list**. An object returns `400 … input not a collection`.
- Granted scopes: `openid offline_access lol ban account lol_region summoner`. `isDPoPBound: false`.
- **The Riot Client's own token (`cid: riot-client`, `/rso-auth/v1/authorization/access-token`)
  is not enough.** The login queue rejects it with `403 forbidden "lack of required permission(s)"`.

Where it came from (`LeagueClient.exe` strings):
- `/rso-auth/v2/authorizations` and `/rso-auth/v2/authorizations/%1`
- `trustLevels`, `always_trusted`
- `openid offline_access lol ban profile email phone birthdate`
- `system.yaml`: `rso.additional_scopes: account`
- "Failed to fetch rso platform id for region claim in authZ request"

### 2. Player config (League edge, Your Shop)

```
GET /client-config/v2/namespace/lol.client_settings/player     (Riot Client loopback)
```

- `lol.client_settings.league_edge.url` = `https://na-red.lol.sgp.pvp.net`
- `lol.client_settings.yourshop` = `{ Active, PromotionName, PromotionStartDate, PromotionEndDate, ThemedBackground }`
- Calling `clientconfig.rpg.riotgames.com/api/v1/config/player` directly returns 401.
  Going through the Riot Client works.

### 3. League session token (LST)

1. `POST https://entitlements.auth.riotgames.com/api/token/v1` with body `{}` and
   Bearer lol token. Response: `{ entitlements_token }`. This URL is
   `servers.entitlements.entitlements_url` in `system.yaml`.
2. `GET https://auth.riotgames.com/userinfo` with `Accept: application/jwt` and
   Bearer lol token. Response: a signed JWT.
3. `POST {pp}/login-queue/v2/login/products/lol/regions/na1` with Bearer lol token and
   body `{ clientName: "lcu", entitlements, userinfo }`. Response: `{ type: "LOGIN", token, … }`.
   - `{pp}` is the player-platform edge, `servers.player_platform_edge.player_platform_edge_url`
     in `system.yaml` = `https://usw2-red.pp.sgp.pvp.net`. NA has `use_gaps_login_flow: true`.
   - If the response is a queue position instead of `LOGIN` + `token`, the collector currently fails.
4. `POST {pp}/session-external/v1/session/create` with Bearer **login token** and body
   `{ claims: { cname: "lcu" }, product: "lol", puuid, region: "na1" }`. The response
   is the LST as a JSON string: `iss https://session.gpsrv.pvp.net`, `cid lss_lol`, `reg NA1`,
   `exp` about 10 minutes after `iat`.
   - **Use the player-platform edge.** The League edge returns 403 for this route.

Where it came from: `GapsLoginFlowEnabled`, `GapsLoginToken (LT)`, `GapsSessionToken (LST)`,
`%1/login-queue/v2/login/products/lol/regions/%2` and `%1/session-external/v1/session/create`
sit next to each other in `LeagueClient.exe`.

### 4. Store catalog → `catalog`

```
GET {league edge}/storefront/v1/catalog?region=NA1&language=en_US     Bearer lol access token
```

- The response is the same array as LCU `/lol-store/v1/catalog`: about 9.5k items,
  about 8.6 MB, with `itemId`, `inventoryType`, `prices`, `sale`, `releaseDate`,
  `inactiveDate`, and so on.
- With the LST instead: `401 NO_MATCHING_PROVIDER`.
- Other storefront routes respond the same way, for example `/storefront/v3/view/skins?language=en_US`.
- `plstore*.lol.riotgames.com` (the `payments_host` in `system.yaml`) no longer resolves,
  and `na.store.leagueoflegends.com` fails TLS. The storefront lives on the League edge now.

### 5. Shoppe stores → `mythicShop`, part of `sanctumBanners`

```
GET {league edge}/catalog/v1/products/d1c2664a-5938-4c41-8d1b-61fd51052c22/stores    Bearer LST
```

- `d1c2664a-…` is League's Shoppe product. `388c3f86-0aa2-4840-b644-91f3a9d77ad0`
  returns TFT stores. `lol` returns `400 Invalid 'productId'`.
- Useful related routes:
  - `…/store-digests`: a cheap list of store names and dates.
  - `…/stores/<storeId>`: one store.
  - `…/stores?storeIds=<id>`
- **Mythic Shop:** active stores with `displayMetadata.shoppefront.id == "MYTHIC_SHOP"`.
  On 2026-10-02 those were `MYTHIC_SHOPPE_DAILY_ROTATION_V4` (4 entries), `…WEEKLY_ROTATION_V6` (8),
  `…BIWEEKLY_ROTATION_V12` (12) and `…FEATURED_MSIWINNERS` (1). The stores and entries
  (`startTime`, `catalogEntries[].endTime`, `purchaseUnits[].fulfillment.itemId`,
  `paymentOptions[].payments[].finalDelta`/`name`) are exactly what
  `processClientDataLinux.ts` reads from LCU `/lol-shoppefront/v1/stores/MYTHIC_SHOP`.
- **Sanctum:** active stores with `displayMetadata.lol.store == "sanctum"`.
  `displayMetadata.sanctum.bannerId` links to the banner definition (step 6).
  Store `startTime`/`endTime` become `startDate`/`endDate` in epoch seconds.
  `displayMetadata.startDate`/`endDate` looked stale, so they are ignored.
- Other stores on the same product, unused: `JADE_SHOP_*` (the new store UI),
  `JADE_BP_*`, `Transfer Store`, `Metagames-Test-Store`.

Where it came from:
- `/catalog/v1/products/%s/stores…` strings in `LeagueClient.exe`.
- "Shoppe Contract League Edge URL", which says the host is the League edge.
- The product id was found by trying every UUID constant in the binary against `…/store-digests`.

### 6. Sanctum banner definitions

`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/nachobanners.json`
(Nacho is Sanctum's internal name). Each entry has `id` (= `bannerId`), `bannerSkin { id, name, rarity }`,
`chasePityThreshold`, `highlightPityThreshold` and `bannerBackgroundTexture`. Joined with step 5,
that gives `RawSanctumBanner`. Override the URL with `NACHO_BANNERS_URL`.

### 7. Your Shop → `yourShopStatus`

From the step 2 config: `Active: true` maps to
`{ name: PromotionName, startTime: PromotionStartDate, endTime: PromotionEndDate, hubEnabled: true }`.
Explicit `Active: false` maps to `{}`, which processing treats as "no Your Shop".
Missing/malformed configuration or an invalid active promotion window fails
collection and preserves the previous snapshot. An active Sanctum store without
a matching CommunityDragon definition also fails rather than silently disappearing.
**Not yet verified while a Your Shop is live.**

## Token cheat sheet

| Token | From | Lifetime | Used for |
| --- | --- | --- | --- |
| Lockfile password | Riot Client lockfile | Until Riot Client restarts | Riot Client loopback API |
| lol access token | Step 1 | About 1h (`accessToken.expiry`) | entitlements, userinfo, login queue, **storefront** |
| Login token | Login queue | Short | session/create only |
| LST | session/create | 10 min | **Shoppe** (`/catalog/v1/…`) |

`collectDirect` creates fresh tokens on every run and never stores them. The lab
probes in `scripts/linux-lab/` save them to `secrets/` (mode 600, gitignored) for testing.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `RIOT_CLIENT_LOCKFILE` | required | Riot Client lockfile path |
| `LEAGUE_PLATFORM` | `NA1` | RSO region claim, login region, catalog region |
| `PLAYER_PLATFORM_EDGE_URL` | `https://usw2-red.pp.sgp.pvp.net` | Login queue and session host (`system.yaml`) |
| `LEAGUE_EDGE_URL` | from player config | Storefront and Shoppe host |
| `STORE_LANGUAGE` | `en_US` | Catalog language |
| `NACHO_BANNERS_URL` | CommunityDragon latest | Sanctum banner definitions |

## Errors seen and what they meant

| Response | Cause |
| --- | --- |
| login-queue `403 forbidden … lack of required permission(s)` | Used the `riot-client` token instead of the `lol` token |
| session/create `403 Forbidden` on `na-red.lol…` | Wrong host. Use the player-platform edge |
| storefront `401 NO_MATCHING_PROVIDER` | Used the LST. The storefront wants the lol access token |
| Shoppe `400 BAD_PATH_PARAMETER Invalid 'productId'` | Product must be a UUID, not `lol` |
| Shoppe `400 (#1002) STORES - Invalid productId` | Valid UUID format but not a Shoppe product |
| Riot Client `400 … 'claims' … not a collection` | `claims` must be a list of strings |
| Riot Client `400 rso_login_token_grant_conflict` | Authorization exists. GET it instead |

## When Riot changes something: re-discovery playbook

All lab tools live in `/home/zando/rotations-linux-lab/tools` (copies in `scripts/linux-lab/`).

1. **Get current client config and binaries** (public CDN, no login):
   - Public config: `clientconfig.rpg.riotgames.com/api/v1/config/public?namespace=keystone.products.league_of_legends.patchlines`.
     Its `platforms.win.configurations[*].patch_url` is the live manifest.
   - `tools/venv/bin/python tools/rman.py <manifest> list REGEX` lists the files in it.
   - `tools/venv/bin/python tools/rman.py <manifest> get '^LeagueClient\.exe$' downloads/lcu`
     downloads only `LeagueClient.exe` (31 MB), not the game.
   - `strings -n 6` plus `strings -n 6 -el` on it go into `research/lcu-strings.txt`.
2. **Find routes:** grep `research/lcu-strings.txt` for `storefront`, `/catalog/v1`,
   `session-external`, `login-queue`, `rso-auth`. Neighbouring strings give context, such as
   which host a contract uses ("Shoppe Contract League Edge URL").
3. **Find hosts:** player config (`tools/player-config.mjs`) and `system.yaml` from the manifest.
4. **Get tokens:** `node tools/lol-authorization.mjs`, then `node tools/league-session.mjs`.
   They write to `secrets/`.
5. **Probe read-only routes:** `node tools/probe-league-edge.mjs /path …` (uses the LST;
   set `PROBE_TOKEN=access` for the lol token). Responses go to `research/probes/`.
   For an unknown UUID, sweep the binary's UUID constants against `…/store-digests`,
   as in step 5 above.
6. **Compare shapes** with `lib/clientSnapshot.js#validateClientData` and the
   `Raw*` types in `lib/types.ts`, then update the mapping in `lib/riotDirect.js`.

## Signing in again

The Riot Client was signed in once with "Stay signed in". If it is ever signed out:

- Start it with `tools/run-riot-stack.sh` (wine-staging, Xvfb `:107`).
- From any terminal, run `tools/venv/bin/python tools/type-login.py`. It types the
  username and password into the window without echoing or storing them.
- If an hCaptcha appears, `python3 tools/capture-display.py` saves the screen to
  `research/wine-screen.png`. A person reads it, then
  `tools/venv/bin/python tools/xinput.py click X Y` clicks the right tiles and the
  Verify button (tile centres for the 3×3 grid: x 531/639/747, y 309/417/525;
  Verify at 762,626).
- Riot's QR sign-in (`tools/qr-login.py`) produces a working `qrlogin.riotgames.com`
  link, but approving from the same phone didn't complete on 2026-10-02.

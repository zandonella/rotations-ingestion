# Riot direct collection reference

`lib/riotDirect.js` collects catalog and rotation data through a signed-in Riot Client session. It creates the League authorization and session needed for shop reads, then maps the results into the same snapshot shape used by the League client collector.

Use [Linux setup](linux-ingestion.md) for commands and [Linux deployment](linux-production.md) for the managed runtime. The collector uses internal client services whose routes and response shapes can change with Riot updates.

## Authentication flow

1. Read the Riot Client lockfile selected by `RIOT_CLIENT_LOCKFILE` and connect to its loopback HTTPS API.
2. Read player configuration from `/client-config/v2/namespace/lol.client_settings/player` for the League edge URL and Your Shop settings.
3. Request a League authorization through `POST /rso-auth/v2/authorizations` with `clientId: "lol"`. Reuse an existing authorization when valid and recreate one near expiry.
4. Request entitlements and signed user information with the League access token.
5. Call the player-platform login queue and create a League session token.
6. Read the storefront with the League access token and Shoppe stores with the League session token.

The Riot Client lockfile contains a loopback port and password. Its self-signed certificate is accepted only for the loopback request. Remote requests retain TLS verification. The collector keeps issued tokens in memory.

| Credential | Used for |
|---|---|
| Riot Client lockfile password | The Riot Client loopback API. |
| League access token | Entitlements, user information, login queue, and storefront reads. |
| Login queue token | Creating the League session. |
| League session token | Shoppe catalog reads. |

## Source mapping

| Snapshot field | Source and mapping |
|---|---|
| `catalog` | `/storefront/v1/catalog` on the League edge, using the configured platform and language. |
| `mythicShop` | Active Shoppe stores with `displayMetadata.shoppefront.id` equal to `MYTHIC_SHOP`. |
| `sanctumBanners` | Active Sanctum stores joined to CommunityDragon's `nachobanners.json` through the banner ID. Store start and end times supply the banner window. |
| `yourShopStatus` | Player configuration fields `Active`, `PromotionName`, `PromotionStartDate`, and `PromotionEndDate`. |

Shoppe reads use the League product UUID `d1c2664a-5938-4c41-8d1b-61fd51052c22` under `/catalog/v1/products/<productId>/stores`.

An explicitly inactive Your Shop maps to an empty status. Missing or malformed configuration, an invalid active promotion window, or an active Sanctum store without its banner definition fails collection. A failed collection does not replace the previous snapshot.

## Configuration

| Variable | Default or purpose |
|---|---|
| `RIOT_CLIENT_LOCKFILE` | Required path to the signed-in Riot Client lockfile. |
| `LEAGUE_PLATFORM` | `NA1`. |
| `PLAYER_PLATFORM_EDGE_URL` | `https://usw2-red.pp.sgp.pvp.net`. |
| `LEAGUE_EDGE_URL` | Read from player configuration unless overridden. |
| `STORE_LANGUAGE` | `en_US`. |
| `NACHO_BANNERS_URL` | CommunityDragon's latest Sanctum banner definitions. |

The defaults target North America. Other regions require matching platform and endpoint configuration and their own data validation. The collector requires the login queue to return a session token and does not wait through a queued login position.

## Troubleshooting

| Symptom | Check |
|---|---|
| Riot Client lockfile unavailable | Start Riot Client, sign in, and confirm the configured file path. |
| Login queue rejects authorization | Confirm that the authorization belongs to the `lol` client. |
| Session creation returns 403 | Check the player-platform edge. Session creation and storefront reads use different hosts. |
| Storefront rejects the token | Storefront reads require the League access token. |
| Shoppe rejects the product | Confirm the League Shoppe product UUID. |
| Collection exits with code 75 | Inspect `data/run/riot-pause.json` for a cooldown or a sign-in review pause. |

When Riot changes a response, compare it with `lib/clientSnapshot.js` validation and the raw types in `lib/types.ts`. Update the mapping in `lib/riotDirect.js` and its regression tests. Validate active Your Shop windows and Sanctum dates against the in-game store when those offers are available.

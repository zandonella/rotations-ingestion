// Linux collector: builds the same four client inputs as getClientData.js without running League
// (which needs Vanguard). It needs a signed-in Riot Client (e.g. under Wine) and talks to it over its
// loopback API, then calls Riot's League services the same way LeagueClient does. Everything after
// the login handshake is a read-only GET.
import fs from 'node:fs/promises';
import https from 'node:https';

// League's product id in the Shoppe ("catalog") service; found in LeagueClient.exe and confirmed by
// /store-digests returning MYTHIC_SHOP and Sanctum stores.
export const LOL_SHOPPE_PRODUCT_ID = 'd1c2664a-5938-4c41-8d1b-61fd51052c22';
const NACHO_BANNERS_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/nachobanners.json';
// Same scopes LeagueClient requests, plus system.yaml's additional_scopes.
const LOL_SCOPES = ['openid', 'offline_access', 'lol', 'ban', 'profile', 'email', 'phone', 'birthdate', 'account'];

export async function loadRiotClientCredentials(env = process.env) {
    if (!env.RIOT_CLIENT_LOCKFILE) throw new Error('Set RIOT_CLIENT_LOCKFILE to the signed-in Riot Client lockfile.');
    let contents;
    try { contents = await fs.readFile(env.RIOT_CLIENT_LOCKFILE, 'utf8'); } catch {
        throw new Error('Riot Client lockfile is unavailable. Start the Riot Client first.');
    }
    const [, , port, password] = contents.trim().split(':');
    if (!Number.isSafeInteger(Number(port)) || !password) throw new Error('Riot Client lockfile has an unexpected format.');
    return { port: Number(port), password };
}

export function createRiotClient({ port, password }, { timeoutMs = 15_000 } = {}) {
    const authorization = `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`;
    return (method, path, body) => new Promise((resolve, reject) => {
        // Self-signed certificate on literal loopback only; credentials are never logged.
        const request = https.request({
            hostname: '127.0.0.1', port, path, method, rejectUnauthorized: false,
            headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        }, response => {
            let text = '';
            response.on('data', chunk => text += chunk);
            response.on('end', () => {
                let parsed = text;
                try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
                resolve({ status: response.statusCode, body: parsed });
            });
        });
        request.on('error', () => reject(new Error(`Riot Client ${path} connection failed or timed out.`)));
        if (body) request.write(JSON.stringify(body));
        request.end();
    });
}

async function riotGet(url, token, what) {
    let response;
    try {
        response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(30_000), redirect: 'error',
        });
    } catch { throw new Error(`${what} request failed or timed out.`); }
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`${what} returned HTTP ${response.status}.`);
    }
    return response.json();
}

async function riotPost(url, token, body, what) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error',
    }).catch(() => { throw new Error(`${what} request failed or timed out.`); });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`${what} returned HTTP ${response.status}.`);
    }
    return response;
}

// The token LeagueClient gets from the Riot Client for the "lol" client id (not the riot-client token).
export async function getLolAccessToken(rc, platform) {
    const request = { clientId: 'lol', trustLevels: ['always_trusted'], scope: LOL_SCOPES, claims: [`rgn_${platform}`] };
    let result = await rc('POST', '/rso-auth/v2/authorizations', request);
    if (result.status === 400 && /already exists/.test(result.body?.message ?? '')) {
        result = await rc('GET', '/rso-auth/v2/authorizations/lol');
        const expiry = result.body?.authorization?.accessToken?.expiry;
        // Recreate rather than reuse a token that is about to expire.
        if (result.status === 200 && Number.isFinite(expiry) && expiry * 1000 < Date.now() + 120_000) {
            await rc('DELETE', '/rso-auth/v2/authorizations/lol');
            result = await rc('POST', '/rso-auth/v2/authorizations', request);
        }
    }
    const token = result.body?.authorization?.accessToken?.token;
    if (result.status !== 200 || !token) {
        throw new Error(`Riot Client did not issue a League authorization (HTTP ${result.status}). Is it signed in?`);
    }
    return token;
}

// LeagueClient's GAPS login: login queue -> League session token (LST). Shoppe requires the LST.
export async function createLeagueSession(accessToken, { platform, playerPlatformEdge }) {
    const ent = await riotPost('https://entitlements.auth.riotgames.com/api/token/v1', accessToken, {}, 'Entitlements');
    const entitlements = (await ent.json()).entitlements_token;
    const userinfoResponse = await fetch('https://auth.riotgames.com/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/jwt' }, signal: AbortSignal.timeout(15_000),
    });
    if (!userinfoResponse.ok) throw new Error(`Userinfo returned HTTP ${userinfoResponse.status}.`);
    const userinfo = (await userinfoResponse.text()).trim();

    const region = platform.toLowerCase();
    const queue = await (await riotPost(`${playerPlatformEdge}/login-queue/v2/login/products/lol/regions/${region}`,
        accessToken, { clientName: 'lcu', entitlements, userinfo }, 'Login queue')).json();
    if (!queue.token) throw new Error(`Login queue did not admit the session (type ${queue.type ?? 'unknown'}).`);

    const puuid = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url')).sub;
    const session = await riotPost(`${playerPlatformEdge}/session-external/v1/session/create`, queue.token,
        { claims: { cname: 'lcu' }, product: 'lol', puuid, region }, 'League session');
    return session.json();
}

const isActive = (store, now) => Date.parse(store.startTime) <= now && (!store.endTime || now < Date.parse(store.endTime));
const seconds = iso => Math.floor(Date.parse(iso) / 1000);

// Same stores /lol-shoppefront/v1/stores/MYTHIC_SHOP lists: daily, weekly, biweekly and featured rotations.
export function selectMythicShop(stores, now = Date.now()) {
    return stores.filter(store => store.displayMetadata?.shoppefront?.id === 'MYTHIC_SHOP' && isActive(store, now));
}

// /lol-sanctum/v1/banners equivalent: live Sanctum stores joined with game-data banner definitions.
export function buildSanctumBanners(stores, nachoBanners, now = Date.now()) {
    const definitions = new Map(nachoBanners.map(banner => [banner.id, banner]));
    const banners = new Map();
    for (const store of stores) {
        if (store.displayMetadata?.lol?.store !== 'sanctum' || !isActive(store, now)) continue;
        const definition = definitions.get(store.displayMetadata.sanctum?.bannerId);
        if (!definition || banners.has(definition.id)) continue;
        banners.set(definition.id, {
            bannerSkin: definition.bannerSkin,
            startDate: seconds(store.startTime),
            endDate: seconds(store.endTime),
            chasePityThreshold: definition.chasePityThreshold,
            highlightPityThreshold: definition.highlightPityThreshold,
            bannerBackgroundTexture: definition.bannerBackgroundTexture ?? null,
        });
    }
    return [...banners.values()];
}

// /lol-yourshop/v1/status equivalent from player config. An inactive shop is an explicit empty status.
export function buildYourShopStatus(config) {
    if (!config || config.Active !== true) return {};
    return { name: config.PromotionName, startTime: config.PromotionStartDate, endTime: config.PromotionEndDate, hubEnabled: true };
}

export async function collectDirect(env = process.env, log = console.log) {
    const platform = env.LEAGUE_PLATFORM || 'NA1';
    const language = env.STORE_LANGUAGE || 'en_US';
    const playerPlatformEdge = env.PLAYER_PLATFORM_EDGE_URL || 'https://usw2-red.pp.sgp.pvp.net';
    const rc = createRiotClient(await loadRiotClientCredentials(env));

    const config = await rc('GET', '/client-config/v2/namespace/lol.client_settings/player');
    if (config.status !== 200) throw new Error(`Riot Client player config returned HTTP ${config.status}.`);
    const leagueEdge = env.LEAGUE_EDGE_URL || config.body['lol.client_settings.league_edge.url'];
    if (!/^https:\/\/[a-z0-9.-]+\.pvp\.net$/.test(leagueEdge ?? '')) throw new Error('League edge URL is missing from player config.');

    const accessToken = await getLolAccessToken(rc, platform);
    log('League authorization ready.');
    const sessionToken = await createLeagueSession(accessToken, { platform, playerPlatformEdge });
    log('League session ready.');

    const catalog = await riotGet(`${leagueEdge}/storefront/v1/catalog?region=${platform}&language=${language}`, accessToken, 'Store catalog');
    const stores = (await riotGet(`${leagueEdge}/catalog/v1/products/${LOL_SHOPPE_PRODUCT_ID}/stores`, sessionToken, 'Shoppe stores')).data;
    const nachoBanners = await riotGet(env.NACHO_BANNERS_URL || NACHO_BANNERS_URL, '', 'Sanctum banner definitions');
    if (!Array.isArray(stores) || !Array.isArray(nachoBanners)) throw new Error('Shoppe or banner response has an unexpected shape.');

    return {
        catalog,
        mythicShop: selectMythicShop(stores),
        sanctumBanners: buildSanctumBanners(stores, nachoBanners),
        yourShopStatus: buildYourShopStatus(config.body['lol.client_settings.yourshop']),
    };
}

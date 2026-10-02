// Create a League session token from the stored Riot Client session (same call LeagueClient makes at login).
// Saves to secrets/league-session.json (mode 600); prints only non-secret claim names/values.
import fs from 'node:fs';

const lab = new URL('..', import.meta.url).pathname;
// Token issued to the "lol" client (tools/lol-authorization.mjs), not the riot-client token.
const lol = JSON.parse(fs.readFileSync(`${lab}secrets/lol-auth.json`, 'utf8')).authorization;
const accessToken = lol.accessToken.token;
const puuid = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url')).sub;
const EDGE = process.env.LEAGUE_EDGE_URL || 'https://na-red.lol.sgp.pvp.net';
const REGION = process.env.LEAGUE_PLATFORM || 'NA1';
const PP_EDGE = process.env.PLAYER_PLATFORM_EDGE_URL || 'https://usw2-red.pp.sgp.pvp.net';
const bearer = { Authorization: `Bearer ${accessToken}` };

// Entitlements + signed userinfo for the lol token (system.yaml entitlements_url; RSO userinfo endpoint).
const ent = await fetch('https://entitlements.auth.riotgames.com/api/token/v1', {
    method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000),
});
const entitlementsToken = (await ent.json().catch(() => ({}))).entitlements_token;
const ui = await fetch('https://auth.riotgames.com/userinfo', { headers: { ...bearer, Accept: 'application/jwt' }, signal: AbortSignal.timeout(15000) });
const userinfo = (await ui.text()).trim();
console.log('entitlements HTTP', ent.status, entitlementsToken ? 'token ok' : 'no token', '| userinfo HTTP', ui.status, userinfo.split('.').length === 3 ? 'jwt' : 'not jwt');

// Step 1: GAPS login queue (LeagueClient: %1/login-queue/v2/login/products/lol/regions/%2) -> login token.
const queue = await fetch(`${PP_EDGE}/login-queue/v2/login/products/lol/regions/${REGION.toLowerCase()}`, {
    method: 'POST',
    headers: { ...bearer, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ clientName: 'lcu', entitlements: entitlementsToken, userinfo }),
    signal: AbortSignal.timeout(15000),
});
const queueBody = await queue.json().catch(() => ({}));
if (!queue.ok || !queueBody.token) {
    console.log('login-queue HTTP', queue.status, queueBody.errorCode ?? '', queueBody.message ?? '', JSON.stringify(queueBody.implementationDetails ?? {}).slice(0, 300));
    process.exit(1);
}
console.log('login-queue HTTP', queue.status, 'type:', queueBody.type ?? '(none)');

// Step 2: League session (LST) from the login token.
const res = await fetch(`${PP_EDGE}/session-external/v1/session/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${queueBody.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ claims: { cname: 'lcu' }, product: 'lol', puuid, region: REGION.toLowerCase() }),
    signal: AbortSignal.timeout(15000),
});
const text = await res.text();
if (!res.ok) {
    console.log('session/create HTTP', res.status, text.slice(0, 300));
    process.exit(1);
}
const token = JSON.parse(text);
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
fs.writeFileSync(`${lab}secrets/league-session.json`, JSON.stringify({ token, edge: EDGE, region: REGION, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
const safe = Object.fromEntries(Object.entries(claims).map(([k, v]) => [k, /tok|sig|key/i.test(k) ? '<redacted>' : v]));
console.log('session/create HTTP', res.status, JSON.stringify(safe, null, 1).slice(0, 2000));

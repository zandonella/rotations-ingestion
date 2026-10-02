// Create a League session token from the stored Riot Client session (same call LeagueClient makes at login).
// Saves to secrets/league-session.json (mode 600); prints only non-secret claim names/values.
import fs from 'node:fs';

const lab = new URL('..', import.meta.url).pathname;
const rc = JSON.parse(fs.readFileSync(`${lab}secrets/rc-session.json`, 'utf8'));
const EDGE = process.env.LEAGUE_EDGE_URL || 'https://na-red.lol.sgp.pvp.net';
const REGION = process.env.LEAGUE_PLATFORM || 'NA1';

const PP_EDGE = process.env.PLAYER_PLATFORM_EDGE_URL || 'https://usw2-red.pp.sgp.pvp.net';

// Step 1: GAPS login queue (LeagueClient: %1/login-queue/v2/login/products/lol/regions/%2) -> login token.
const queue = await fetch(`${PP_EDGE}/login-queue/v2/login/products/lol/regions/${REGION.toLowerCase()}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${rc.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ clientName: 'lcu', entitlements: rc.entitlementsToken, userinfo: rc.userinfo.userInfo }),
    signal: AbortSignal.timeout(15000),
});
const queueBody = await queue.json().catch(() => ({}));
if (!queue.ok || !queueBody.token) {
    console.log('login-queue HTTP', queue.status, queueBody.errorCode ?? '', queueBody.message ?? '', JSON.stringify(queueBody.implementationDetails ?? {}).slice(0, 300));
    process.exit(1);
}
console.log('login-queue HTTP', queue.status, 'type:', queueBody.type ?? '(none)');

// Step 2: League session (LST) from the login token.
const res = await fetch(`${EDGE}/session-external/v1/session/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${queueBody.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ claims: { cname: 'lcu' }, product: 'lol', puuid: rc.puuid, region: REGION.toLowerCase() }),
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

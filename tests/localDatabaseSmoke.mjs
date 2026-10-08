// One end-to-end smoke check: simulated LCU HTTPS -> real collector -> local Supabase.
// Never uses a real account. Requires `npm run local:static` first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLIENT_ENDPOINTS } from '../lib/lcuClient.js';
import { assertLocalSupabase } from '../lib/localMode.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const local = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
assertLocalSupabase({ ...local, INGESTION_LOCAL_ONLY: 'true' });
const directory = fs.mkdtempSync(path.join(root, 'data/smoke-'));
const headers = { apikey: local.SUPABASE_KEY, Authorization: `Bearer ${local.SUPABASE_KEY}` };
async function rows(table, query = '') {
    const res = await fetch(`${local.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    assert.equal(res.status, 200);
    return res.json();
}
const [item] = await rows('CatalogItem', 'ItemType=eq.1&RiotItemID=lt.99999001&limit=1');
assert.ok(item, 'Run local:static first.');
const start = new Date(Date.now() - 60_000).toISOString();
const end = new Date(Date.now() + 3_600_000).toISOString();
const data = {
    catalog: [{ itemId: item.RiotItemID, inventoryType: 'CHAMPION_SKIN', releaseDate: start, inactiveDate: null,
        prices: [{ cost: 100, currency: 'RP', discount: 0 }],
        sale: { startDate: start, endDate: end, prices: [{ cost: 50, currency: 'RP', discount: 0.5 }] } }],
    mythicShop: [{ startTime: start, catalogEntries: [{ id: '00000000-0000-4000-8000-000000000001', endTime: end,
        purchaseUnits: [{ fulfillment: { itemId: item.ItemID }, paymentOptions: [{ payments: [{ finalDelta: 100, name: 'lol_mythic_essence' }] }] }] }] }],
    sanctumBanners: [{ bannerSkin: { id: item.RiotItemID, name: 'AnnieSkin1', rarity: 'kExalted' },
        startDate: Date.parse(start) / 1000, endDate: Date.parse(end) / 1000, chasePityThreshold: 80 }],
    yourShopStatus: { name: 'linux-lab-smoke', startTime: start, endTime: end, hubEnabled: true },
};
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${directory}/key.pem`, '-out', `${directory}/cert.pem`, '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
const endpoints = Object.fromEntries(Object.entries(CLIENT_ENDPOINTS).map(([name, endpoint]) => [endpoint, data[name]]));
const server = https.createServer({ key: fs.readFileSync(`${directory}/key.pem`), cert: fs.readFileSync(`${directory}/cert.pem`) }, (request, response) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, `Basic ${Buffer.from('riot:lab-password').toString('base64')}`);
    const payload = request.url === '/lol-store/v1/status' ? { storefrontIsRunning: true } : endpoints[request.url];
    response.writeHead(payload ? 200 : 404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload || {}));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
fs.writeFileSync(`${directory}/lockfile`, `LeagueClient:1:${server.address().port}:lab-password:https`, { mode: 0o600 });
try {
    const status = await new Promise(resolve => {
        const child = spawn(process.execPath, ['scripts/localRun.mjs', 'client'], {
            cwd: root, env: { ...process.env, LEAGUE_LOCKFILE: `${directory}/lockfile`, CLIENT_DATA_DIRECTORY: directory,
                LEAGUE_CONNECTION_ATTEMPTS: '1', LEAGUE_REQUEST_TIMEOUT_MS: '3000' }, stdio: 'inherit',
        });
        child.on('exit', resolve);
        child.on('error', () => resolve(1));
    });
    assert.equal(status, 0);
    assert.ok((await rows('CatalogSale', `RiotItemID=eq.${item.RiotItemID}&SalePrice=eq.50`)).length);
    assert.ok((await rows('MythicSale', 'OfferID=eq.00000000-0000-4000-8000-000000000001')).length);
    assert.ok((await rows('SanctumSale', `RiotItemID=eq.${item.RiotItemID}`)).length);
    assert.ok((await rows('YourShopSale', 'ShopName=eq.linux-lab-smoke&IsActive=eq.true')).length);
    console.log('PASS: HTTPS collector -> snapshot -> all four local sale tables. Sources are synthetic.');
} finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
}

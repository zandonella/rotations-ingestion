// Fetch authenticated player client-config for League and list service URLs relevant to the store.
import fs from 'node:fs';
const lab = new URL('..', import.meta.url).pathname;
const s = JSON.parse(fs.readFileSync(`${lab}secrets/rc-session.json`, 'utf8'));
const headers = { Authorization: `Bearer ${s.accessToken}`, 'X-Riot-Entitlements-JWT': s.entitlementsToken ?? '' };
const out = {};
for (const ns of ['', 'lol.client_settings', 'keystone.products.league_of_legends']) {
  for (const kind of ['player', 'public']) {
    const url = `https://clientconfig.rpg.riotgames.com/api/v1/config/${kind}?app=League%20of%20Legends${ns ? `&namespace=${ns}` : ''}`;
    const r = await fetch(url, { headers: kind === 'player' ? headers : {} });
    console.log(kind, ns || '(all)', r.status);
    if (r.ok) Object.assign(out, await r.json());
  }
}
fs.writeFileSync(`${lab}research/player-config.json`, JSON.stringify(out, null, 1), { mode: 0o600 });
const hits = Object.entries(out).filter(([k, v]) => /store|shoppe|sanctum|yourshop|session|ledge|platform|catalog|gacha|loot|inventory/i.test(k) && typeof v === 'string' && /https?:\/\//.test(v));
for (const [k, v] of hits) console.log(k, '=', v);
console.log('total keys', Object.keys(out).length);

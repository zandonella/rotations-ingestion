// Read-only GET probes against League services using secrets/league-session.json (and the lol access token).
// Usage: node probe-league-edge.mjs PATH [PATH...]   (paths may start with https:// for another host)
// Saves each response body to research/probes/<sanitized>.json; prints status + a short preview.
import fs from 'node:fs';

const lab = new URL('..', import.meta.url).pathname;
const session = JSON.parse(fs.readFileSync(`${lab}secrets/league-session.json`, 'utf8'));
const lol = JSON.parse(fs.readFileSync(`${lab}secrets/lol-auth.json`, 'utf8')).authorization;
const EDGE = process.env.LEAGUE_EDGE_URL || 'https://na-red.lol.sgp.pvp.net';
const tokens = { lst: session.token, access: lol.accessToken.token };
const which = process.env.PROBE_TOKEN || 'lst';
fs.mkdirSync(`${lab}research/probes`, { recursive: true });

for (const p of process.argv.slice(2)) {
    const url = p.startsWith('https://') ? p : `${EDGE}${p}`;
    let line;
    try {
        const r = await fetch(url, {
            headers: { Authorization: `Bearer ${tokens[which]}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(20000),
        });
        const body = await r.text();
        const name = url.replace(/^https:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 120);
        if (r.ok) fs.writeFileSync(`${lab}research/probes/${name}.json`, body);
        line = `${r.status} ${body.length}B ${body.slice(0, 160).replace(/\s+/g, ' ')}`;
    } catch (e) {
        line = `ERR ${e.cause?.code || e.message}`;
    }
    console.log(`[${which}] ${p}\n    ${line}`);
}

// Ask the signed-in Riot Client for a League ("lol" client) authorization, the way LeagueClient does at startup.
// Saves tokens to secrets/lol-auth.json (mode 600); prints only non-secret metadata and error bodies.
import fs from 'node:fs';
import https from 'node:https';

const lab = new URL('..', import.meta.url).pathname;
const lockfile = `${lab}wine/prefix/drive_c/users/zando/AppData/Local/Riot Games/Riot Client/Config/lockfile`;
const [, , port, password] = fs.readFileSync(lockfile, 'utf8').trim().split(':');
const PLATFORM = process.env.LEAGUE_PLATFORM || 'NA1';

function rc(method, path, body) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: '127.0.0.1', port, path, method, rejectUnauthorized: false,
            headers: {
                Authorization: 'Basic ' + Buffer.from(`riot:${password}`).toString('base64'),
                'Content-Type': 'application/json', Accept: 'application/json',
            },
        }, res => {
            let s = '';
            res.on('data', c => s += c);
            res.on('end', () => {
                let parsed = s;
                try { parsed = s ? JSON.parse(s) : null; } catch { /* keep text */ }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

const jwt = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));
const request = {
    clientId: 'lol',
    trustLevels: ['always_trusted'],
    scope: ['openid', 'offline_access', 'lol', 'ban', 'profile', 'email', 'phone', 'birthdate', 'account'],
    claims: [`rgn_${PLATFORM}`],
};

let created = await rc('POST', '/rso-auth/v2/authorizations', request);
if (created.status === 400 && /already exists/.test(created.body?.message ?? '')) {
    created = await rc('GET', '/rso-auth/v2/authorizations/lol');
}
if (created.status >= 300) {
    console.log('POST /rso-auth/v2/authorizations', created.status, JSON.stringify(created.body).slice(0, 500));
    process.exit(1);
}
const shape = o => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' ? shape(v) : typeof v])) : typeof o);
console.log('POST /rso-auth/v2/authorizations', created.status, 'response shape:', JSON.stringify(shape(created.body)));

const access = created.body?.authorization?.accessToken?.token;
if (!access) process.exit(1);
const claims = jwt(access);
const grants = created.body.permission_hints?.granted_permissions?.map(p => p.permission);
fs.mkdirSync(`${lab}secrets`, { recursive: true, mode: 0o700 });
fs.writeFileSync(`${lab}secrets/lol-auth.json`, JSON.stringify({ ...created.body, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
console.log({ cid: claims.cid, scopes: claims.scp, expires: new Date(claims.exp * 1000).toISOString(), grants, isDPoPBound: created.body.authorization.isDPoPBound });

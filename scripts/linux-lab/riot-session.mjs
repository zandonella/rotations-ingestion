// Pull the signed-in Riot Client's tokens into secrets/rc-session.json (mode 600). Prints only non-secret metadata.
import fs from 'node:fs';
import https from 'node:https';

const lab = new URL('..', import.meta.url).pathname;
const lockfile = `${lab}wine/prefix/drive_c/users/zando/AppData/Local/Riot Games/Riot Client/Config/lockfile`;
const [, , port, password] = fs.readFileSync(lockfile, 'utf8').trim().split(':');

export function rc(path) {
    return new Promise((resolve, reject) => https.get({
        hostname: '127.0.0.1', port, path, rejectUnauthorized: false,
        headers: { Authorization: 'Basic ' + Buffer.from(`riot:${password}`).toString('base64') },
    }, res => {
        let s = '';
        res.on('data', c => s += c);
        res.on('end', () => {
            let body = null;
            try { body = s ? JSON.parse(s) : null; } catch { body = s; }
            resolve({ status: res.statusCode, body });
        });
    }).on('error', reject));
}

const jwt = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));

if (import.meta.url === `file://${process.argv[1]}`) {
    const access = await rc('/rso-auth/v1/authorization/access-token');
    const ent = await rc('/entitlements/v1/token');
    const userinfo = await rc('/rso-auth/v1/authorization/userinfo');
    const region = await rc('/riotclient/region-locale');
    if (access.status !== 200) throw new Error(`access-token HTTP ${access.status}`);
    const a = jwt(access.body.token);
    const session = {
        accessToken: access.body.token, entitlementsToken: ent.body?.accessToken, entitlements: ent.body?.entitlements,
        puuid: a.sub, userinfo: userinfo.body, region: region.body, savedAt: new Date().toISOString(),
    };
    fs.mkdirSync(`${lab}secrets`, { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${lab}secrets/rc-session.json`, JSON.stringify(session, null, 2), { mode: 0o600 });
    console.log({
        accessStatus: access.status, entStatus: ent.status, userinfoStatus: userinfo.status,
        scopes: a.scp, clientId: a.cid, expires: new Date(a.exp * 1000).toISOString(),
        entitlements: ent.body?.entitlements, region: region.body, accessTokenClaims: Object.keys(a),
    });
}

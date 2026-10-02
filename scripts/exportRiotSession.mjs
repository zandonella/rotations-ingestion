import fs from 'node:fs';
import path from 'node:path';
import { connectLcu } from '../lib/lcuClient.js';
import { assertRiotStoreUrl, tokenExpiry, validateRiotSession } from '../lib/riotSession.js';

try {
    const destination = process.argv[2];
    if (!destination) throw new Error('Usage: node scripts/exportRiotSession.mjs <private-session-file>');
    const client = await connectLcu();
    const token = await client.get('/lol-rso-auth/v1/authorization/access-token');
    const storeUrl = assertRiotStoreUrl(await client.get('/lol-store/v1/getStoreUrl'));
    const region = await client.get('/riotclient/region-locale');
    const session = validateRiotSession({
        schemaVersion: 1, exportedAt: new Date().toISOString(), storeUrl,
        accessToken: token.accessToken, expiresAt: tokenExpiry(token.accessToken),
        region: region.region, locale: region.locale,
    });
    fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true, mode: 0o700 });
    // Do not overwrite a symlink or a pre-existing broadly readable file.
    fs.writeFileSync(destination, JSON.stringify(session, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(`Session exported privately. Expiry: ${session.expiresAt || 'not available; Riot will validate it'}.`);
} catch (error) {
    // Avoid echoing filesystem errors that could embed arguments.
    console.error(error.code ? `Session export failed (${error.code}).` : error.message);
    process.exitCode = 1;
}

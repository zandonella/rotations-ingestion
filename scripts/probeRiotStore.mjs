import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeStore } from '../lib/riotSession.js';

try {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: node scripts/probeRiotStore.mjs <private-session-file>');
    if (process.platform !== 'win32' && (fs.statSync(file).mode & 0o077)) throw new Error('Session file must have mode 600 (chmod 600).');
    const session = JSON.parse(fs.readFileSync(file, 'utf8'));
    const results = await probeStore(session);
    const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'data/probes');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const { page, data } of results) {
        fs.writeFileSync(path.join(directory, `store-${page}.json`), JSON.stringify(data, null, 2), { mode: 0o600 });
        console.log(`${page}: fetched JSON (${Array.isArray(data) ? `${data.length} entries` : 'object'}). Saved for schema comparison only.`);
    }
} catch (error) {
    console.error(error.code ? `Store probe failed (${error.code}).` : error instanceof SyntaxError ? 'Session file is not JSON.' : error.message);
    process.exitCode = 1;
}

import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { parseLeagueLockfile } from './leagueLockfile.js';

export const CLIENT_ENDPOINTS = Object.freeze({
    catalog: '/lol-store/v1/catalog',
    mythicShop: '/lol-shoppefront/v1/stores/MYTHIC_SHOP',
    sanctumBanners: '/lol-sanctum/v1/banners',
    yourShopStatus: '/lol-yourshop/v1/status',
});
const READ_ENDPOINTS = new Set([
    ...Object.values(CLIENT_ENDPOINTS),
    '/lol-store/v1/status', '/lol-store/v1/getStoreUrl',
    '/lol-rso-auth/v1/authorization/access-token',
    '/lol-league-session/v1/league-session-token', '/riotclient/region-locale',
]);

export function positiveInteger(value, fallback, name) {
    const number = value === undefined ? fallback : Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > 2_147_483_647) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return number;
}

export async function loadLcuCredentials(env = process.env) {
    const defaultDirectory = process.platform === 'darwin'
        ? '/Applications/League of Legends.app/Contents/LoL'
        : process.platform === 'win32' ? 'C:\\Riot Games\\League of Legends' : null;
    const directory = env.LEAGUE_INSTALL_DIRECTORY || defaultDirectory;
    const lockfile = env.LEAGUE_LOCKFILE || (directory && path.join(directory, 'lockfile'));
    if (!lockfile) {
        throw new Error('Set LEAGUE_LOCKFILE to a Wine lockfile or a private copy from the client host. For an SSH tunnel also set LEAGUE_LCU_PORT.');
    }
    let contents;
    try { contents = await fs.readFile(lockfile, 'utf8'); } catch {
        throw new Error('League lockfile is unavailable. Start the client or refresh the private lockfile copy.');
    }
    const credentials = parseLeagueLockfile(contents);
    const port = positiveInteger(env.LEAGUE_LCU_PORT, credentials.port, 'LEAGUE_LCU_PORT');
    if (port > 65535) throw new Error('LEAGUE_LCU_PORT must be at most 65535.');
    return { ...credentials, port };
}

// The client uses a self-signed certificate. The exception is limited to literal
// loopback; remote clients must be reached through an authenticated SSH tunnel.
// No global TLS setting changes, redirects, purchase endpoints, or WebSocket.
export function createLcuClient(credentials, { timeoutMs = 15_000 } = {}) {
    const authorization = `Basic ${Buffer.from(`riot:${credentials.password}`).toString('base64')}`;
    return {
        async get(endpoint) {
            if (!READ_ENDPOINTS.has(endpoint)) throw new Error('LCU endpoint is not in the read-only allowlist.');
            return new Promise((resolve, reject) => {
                const request = https.get({
                    hostname: '127.0.0.1', port: credentials.port, path: endpoint,
                    rejectUnauthorized: false,
                    headers: { Authorization: authorization, Accept: 'application/json' },
                    signal: AbortSignal.timeout(timeoutMs),
                }, response => {
                    if (response.statusCode !== 200) {
                        response.resume();
                        reject(new Error(`LCU ${endpoint} returned HTTP ${response.statusCode}.`));
                        return;
                    }
                    const chunks = [];
                    let size = 0;
                    response.on('data', chunk => {
                        size += chunk.length;
                        if (size > 32 * 1024 * 1024) request.destroy(new Error('Response too large.'));
                        else chunks.push(chunk);
                    });
                    response.on('error', () => reject(new Error(`LCU ${endpoint} response interrupted.`)));
                    response.on('end', () => {
                        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
                        catch { reject(new Error(`LCU ${endpoint} did not return JSON.`)); }
                    });
                });
                // Never log request objects: they contain the lockfile password.
                request.on('error', () => reject(new Error(`LCU ${endpoint} connection failed or timed out.`)));
            });
        },
    };
}

export async function connectLcu(env = process.env, log = console.log) {
    const attempts = positiveInteger(env.LEAGUE_CONNECTION_ATTEMPTS, 12, 'LEAGUE_CONNECTION_ATTEMPTS');
    const delay = positiveInteger(env.LEAGUE_CONNECTION_DELAY_MS, 5000, 'LEAGUE_CONNECTION_DELAY_MS');
    const timeoutMs = positiveInteger(env.LEAGUE_REQUEST_TIMEOUT_MS, 15_000, 'LEAGUE_REQUEST_TIMEOUT_MS');
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const client = createLcuClient(await loadLcuCredentials(env), { timeoutMs });
            const status = await client.get('/lol-store/v1/status');
            if (status?.storefrontIsRunning !== true) throw new Error('League storefront is not ready.');
            return client;
        } catch (error) {
            lastError = error;
            log(`League store connection attempt ${attempt}/${attempts} failed.`);
            if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

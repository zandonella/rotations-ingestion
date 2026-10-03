import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { createRiotClient, loadRiotClientCredentials } from '../lib/riotDirect.js';
try {
    const config = parseEnv(fs.readFileSync('.env.linux.prod', 'utf8'));
    const rc = createRiotClient(await loadRiotClientCredentials(config), { timeoutMs: 5000 });
    const response = await rc('GET', '/client-config/v2/namespace/lol.client_settings/player');
    if (response.status !== 200 || typeof response.body?.['lol.client_settings.yourshop']?.Active !== 'boolean') process.exitCode = 1;
} catch { process.exitCode = 1; }

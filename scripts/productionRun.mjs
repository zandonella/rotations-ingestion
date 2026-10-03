import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { productionEnvironment } from '../lib/productionConfig.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = parseEnv(fs.readFileSync(path.join(root, '.env.linux.prod'), 'utf8'));
const env = { ...process.env, ...productionEnvironment(config), CLIENT_DATA_DIRECTORY: path.join(root, 'data/source') };
const command = process.argv[2];
function run(executable, ...args) {
    const result = spawnSync(executable, args, { cwd: root, env, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
if (command === 'check') {
    console.log('Production configuration valid; no connections made.');
} else if (command === 'report-status') {
    run(process.execPath, 'scripts/reportLinuxRun.mjs');
} else if (command === 'direct' || command === 'static') {
    fs.mkdirSync(path.join(root, 'data/run'), { recursive: true, mode: 0o700 });
    const marker = path.join(root, 'data/run/production-static-date');
    const today = new Date().toISOString().slice(0, 10);
    if (command === 'static' || !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== today) {
        run('bash', 'environmentSetupLinux.sh');
        fs.writeFileSync(marker, today, { mode: 0o600 });
    }
    if (command === 'direct') {
        run(process.execPath, 'scripts/collectDirect.mjs');
        run(process.execPath, 'processClientDataLinux.ts');
    }
} else {
    throw new Error('Use check, direct, static, or report-status.');
}

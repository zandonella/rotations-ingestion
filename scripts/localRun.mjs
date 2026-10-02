import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { assertLocalSupabase } from '../lib/localMode.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(root, '.env.local');
const local = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
const env = {
    ...process.env, ...local,
    INGESTION_LOCAL_ONLY: 'true', CLIENT_REQUIRE_SNAPSHOT: 'true',
    // Never inherit production destinations or credentials from the calling shell.
    SUPABASE_URL: local.SUPABASE_URL || 'http://127.0.0.1:55421',
    SUPABASE_KEY: local.SUPABASE_KEY || '',
    DISCORD_WEBHOOK_URL: '', DISCORD_MENTION_ROLE_ID: '',
    ROTATIONS_API_REFRESH_URL: '', ROTATIONS_API_REFRESH_SECRET: '',
    WOL_API_IP: '', WAKE_SCHEDULER_ENABLED: 'false',
};
assertLocalSupabase(env);
const command = process.argv[2];
const commands = {
    collect: [[process.execPath, 'getClientData.js']],
    client: [[process.execPath, 'getClientData.js'], [process.execPath, 'processClientData.ts']],
    'process-client': [[process.execPath, 'processClientData.ts']],
    static: [['bash', 'environmentSetup.sh']],
    'process-static': [[process.execPath, 'processStaticData.ts']],
};
if (!commands[command]) throw new Error('Use collect, client, process-client, static, or process-static.');
if (command !== 'collect' && !env.SUPABASE_KEY) throw new Error('Set the local service-role key in .env.local first.');
for (const [executable, ...args] of commands[command]) {
    const result = spawnSync(executable, args, { cwd: root, env, stdio: 'inherit' });
    if (result.status !== 0) {
        process.exitCode = result.status || 1;
        break;
    }
}

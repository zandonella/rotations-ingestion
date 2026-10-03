import test from 'node:test';
import assert from 'node:assert/strict';
import { productionEnvironment } from '../lib/productionConfig.js';
const valid = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test', RIOT_CLIENT_LOCKFILE: '/runtime/lockfile' };
test('production rejects local, insecure, and incomplete destinations', () => {
    for (const SUPABASE_URL of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://user:password@example.com', 'https://example.com/path']) {
        assert.throws(() => productionEnvironment({ ...valid, SUPABASE_URL }));
    }
    assert.throws(() => productionEnvironment({ ...valid, SUPABASE_KEY: '' }));
    assert.throws(() => productionEnvironment({ ...valid, RIOT_CLIENT_LOCKFILE: 'relative' }));
});
test('production forces fresh snapshots and disables Windows wakes and success spam', () => {
    const env = productionEnvironment({ ...valid, WAKE_SCHEDULER_ENABLED: 'true', INGESTION_POLL_INTERVAL_MINUTES: '1440', INGESTION_LOCAL_ONLY: 'true' });
    assert.equal(env.WAKE_SCHEDULER_ENABLED, 'false');
    assert.equal(env.INGESTION_POLL_INTERVAL_MINUTES, '30');
    assert.equal(env.CLIENT_REQUIRE_SNAPSHOT, 'true');
    assert.equal(env.DISCORD_SUCCESS_ENABLED, 'false');
    assert.equal(env.INGESTION_LOCAL_ONLY, 'false');
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
test('production runs static daily, and failures stop dependent processing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rotations-production-test-'));
    try {
        fs.mkdirSync(path.join(root, 'scripts'));
        fs.mkdirSync(path.join(root, 'lib'));
        fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
        for (const file of ['scripts/productionRun.mjs', 'lib/productionConfig.js']) {
            fs.copyFileSync(new URL(`../${file}`, import.meta.url), path.join(root, file));
        }
        fs.writeFileSync(path.join(root, '.env.linux.prod'), 'SUPABASE_URL=https://example.supabase.co\nSUPABASE_KEY=test\nRIOT_CLIENT_LOCKFILE=/runtime/lockfile\n');
        fs.writeFileSync(path.join(root, 'environmentSetupLinux.sh'), 'echo static >> calls\n[ ! -f fail-static ]\n');
        fs.writeFileSync(path.join(root, 'scripts/collectDirect.mjs'), "import fs from 'node:fs'; fs.appendFileSync('calls', 'collect\\n'); if(fs.existsSync('fail-collect')) process.exit(1);");
        fs.writeFileSync(path.join(root, 'processClientDataLinux.ts'), "import fs from 'node:fs'; fs.appendFileSync('calls', 'process\\n');");
        const run = () => spawnSync(process.execPath, ['scripts/productionRun.mjs', 'direct'], { cwd: root });
        assert.equal(run().status, 0);
        assert.equal(run().status, 0);
        assert.equal(fs.readFileSync(path.join(root, 'calls'), 'utf8'), 'static\ncollect\nprocess\ncollect\nprocess\n');
        fs.writeFileSync(path.join(root, 'calls'), '');
        fs.writeFileSync(path.join(root, 'fail-collect'), '');
        assert.equal(run().status, 1);
        assert.equal(fs.readFileSync(path.join(root, 'calls'), 'utf8'), 'collect\n');
        fs.unlinkSync(path.join(root, 'data/run/production-static-date'));
        fs.writeFileSync(path.join(root, 'calls'), '');
        fs.writeFileSync(path.join(root, 'fail-static'), '');
        assert.equal(run().status, 1);
        assert.equal(fs.readFileSync(path.join(root, 'calls'), 'utf8'), 'static\n');
        assert.equal(fs.existsSync(path.join(root, 'data/run/production-static-date')), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

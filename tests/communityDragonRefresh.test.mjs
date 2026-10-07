import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { refreshCommunityDragon, communityDragonEscalated } from '../lib/communityDragonRefresh.js';
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdragon-refresh-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'data/run'), { recursive: true });
    return root;
}
test('upstream outage warns, uses an hourly cooldown, and retries successfully', t => {
    const root = fixture(t), start = Date.parse('2026-10-07T00:00:00Z');
    fs.writeFileSync(path.join(root, 'data/run/production-static-date'), '2026-10-06');
    let attempts = 0;
    const unavailable = () => { attempts++; return { status: 76 }; };
    assert.match(refreshCommunityDragon(root, unavailable, start), /CommunityDragon unavailable/);
    assert.match(refreshCommunityDragon(root, unavailable, start + 30 * 60_000), /CommunityDragon unavailable/);
    assert.equal(attempts, 1);
    assert.equal(fs.readFileSync(path.join(root, 'data/run/production-static-date'), 'utf8'), '2026-10-06');
    assert.equal(refreshCommunityDragon(root, () => { attempts++; return { status: 0 }; }, start + 60 * 60_000), undefined);
    assert.equal(attempts, 2);
    assert.equal(fs.existsSync(path.join(root, 'data/run/communitydragon-retry.json')), false);
    refreshCommunityDragon(root, unavailable, start + 90 * 60_000);
    assert.equal(attempts, 2);
});
test('local processing and filesystem failures are not classified as an upstream outage', t => {
    const root = fixture(t);
    assert.throws(() => refreshCommunityDragon(root, () => ({ status: 1 })), /Static data processing failed/);
    assert.throws(() => refreshCommunityDragon(root, () => ({ status: null, error: new Error('spawn failed') })), /spawn failed/);
    assert.equal(fs.existsSync(path.join(root, 'data/run/communitydragon-retry.json')), false);
});
function shellFixture(t, curlBody) {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, 'bin'));
    fs.mkdirSync(path.join(root, 'data/source'));
    fs.copyFileSync(new URL('../environmentSetupLinux.sh', import.meta.url), path.join(root, 'environmentSetupLinux.sh'));
    fs.writeFileSync(path.join(root, 'processStaticDataLinux.ts'), "import fs from 'node:fs'; fs.writeFileSync('processed', 'yes');\n");
    fs.writeFileSync(path.join(root, 'bin/curl'), '#!/bin/bash\n' + curlBody, { mode: 0o700 });
    fs.symlinkSync(process.execPath, path.join(root, 'bin/node'));
    fs.writeFileSync(path.join(root, 'data/source/finishers.json'), '["cached"]');
    return { root, run: () => spawnSync('bash', ['environmentSetupLinux.sh'], {
        cwd: root, env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` }, encoding: 'utf8', timeout: 5000,
    }) };
}
test('failed HTTP download stops immediately, keeps cached files, and skips static processing', t => {
    const f = shellFixture(t, "echo call >> calls\nexit 22\n");
    assert.equal(f.run().status, 76);
    assert.equal(fs.readFileSync(path.join(f.root, 'data/source/finishers.json'), 'utf8'), '["cached"]');
    assert.equal(fs.readFileSync(path.join(f.root, 'calls'), 'utf8').trim(), 'call');
    assert.equal(fs.existsSync(path.join(f.root, 'processed')), false);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'data/source')), ['finishers.json']);
});
test('curl local file-write errors remain errors', t => {
    const f = shellFixture(t, 'exit 23\n');
    assert.equal(f.run().status, 23);
});
test('invalid downloaded JSON preserves all cached files', t => {
    const f = shellFixture(t, `while (( $# )); do
if [[ "$1" == --output ]]; then echo 'invalid' > "$2"; exit 0; fi
shift
done
`);
    assert.equal(f.run().status, 76);
    assert.equal(fs.readFileSync(path.join(f.root, 'data/source/finishers.json'), 'utf8'), '["cached"]');
    assert.equal(fs.existsSync(path.join(f.root, 'processed')), false);
});
test('complete valid downloads replace cache and invoke static processing', t => {
    const f = shellFixture(t, `while (( $# )); do
if [[ "$1" == --output ]]; then echo '[]' > "$2"; exit 0; fi
shift
done
`);
    assert.equal(f.run().status, 0);
    assert.equal(fs.readFileSync(path.join(f.root, 'data/source/finishers.json'), 'utf8').trim(), '[]');
    assert.equal(fs.readFileSync(path.join(f.root, 'processed'), 'utf8'), 'yes');
    assert.equal(fs.readdirSync(path.join(f.root, 'data/source')).length, 8);
});

test('six warning periods escalate at three hours, stay escalated, and reset after recovery', t => {
    const root = fixture(t), start = Date.parse('2026-10-07T00:00:00Z');
    let downloads = 0;
    const fail = () => { downloads++; return { status: 76 }; };
    for (let period = 0; period < 6; period++) {
        refreshCommunityDragon(root, fail, start + period * 30 * 60_000);
        assert.equal(communityDragonEscalated(root), false);
        // Same-slot retries cannot inflate the warning count.
        refreshCommunityDragon(root, fail, start + period * 30 * 60_000 + 1000);
    }
    const file = path.join(root, 'data/run/communitydragon-retry.json');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).consecutiveWarnings, 6);
    assert.equal(downloads, 3);
    refreshCommunityDragon(root, fail, start + 3 * 3_600_000);
    assert.equal(communityDragonEscalated(root), true);
    for (let period = 7; period < 12; period++) {
        refreshCommunityDragon(root, fail, start + period * 30 * 60_000);
        assert.equal(communityDragonEscalated(root), true);
    }
    refreshCommunityDragon(root, () => ({ status: 0 }), start + 6 * 3_600_000);
    assert.equal(communityDragonEscalated(root), false);
    assert.equal(fs.existsSync(file), false);
    refreshCommunityDragon(root, fail, start + 24 * 3_600_000);
    assert.equal(communityDragonEscalated(root), false);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).consecutiveWarnings, 1);
});

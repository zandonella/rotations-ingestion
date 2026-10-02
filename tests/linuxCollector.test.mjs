import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertLocalSupabase } from '../lib/localMode.js';
import { collectClientSnapshot, readClientSnapshot, saveClientSnapshot } from '../lib/clientSnapshot.js';

test('local mode refuses remote database destinations', () => {
    assertLocalSupabase({ INGESTION_LOCAL_ONLY: 'true', SUPABASE_URL: 'http://127.0.0.1:55421' });
    for (const url of ['https://example.supabase.co', 'http://127.0.0.1.evil.test', 'http://user@127.0.0.1:55421']) {
        assert.throws(() => assertLocalSupabase({ INGESTION_LOCAL_ONLY: 'true', SUPABASE_URL: url }));
    }
});

test('an interrupted collection preserves the previous snapshot; expired data cannot be processed', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rotations-collector-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const before = { schemaVersion: 1, source: 'test', fetchedAt: new Date().toISOString(), data: {
        catalog: [], mythicShop: [], sanctumBanners: [], yourShopStatus: { message: 'No Your Shop available' },
    } };
    saveClientSnapshot(before, directory);
    await assert.rejects(async () => {
        const snapshot = await collectClientSnapshot({ get: async endpoint => {
            if (endpoint.includes('shoppefront')) throw new Error('HTTP 503');
            return [];
        } });
        saveClientSnapshot(snapshot, directory);
    }, /503/);
    assert.deepEqual(readClientSnapshot(directory), before.data);
    assert.throws(() => readClientSnapshot(directory, { now: Date.now() + 3_600_000 }), /stale/);
});

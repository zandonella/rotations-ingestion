import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertLocalSupabase } from '../lib/localMode.js';
import { collectClientSnapshot, readClientSnapshot, saveClientSnapshot } from '../lib/clientSnapshot.js';
import { buildSanctumBanners, buildYourShopStatus, selectMythicShop } from '../lib/riotDirect.js';

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

test('direct collector maps Shoppe stores and banner data to client shapes', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    const store = (meta, start, end) => ({ displayMetadata: meta, startTime: start, endTime: end, catalogEntries: [] });
    const stores = [
        store({ shoppefront: { id: 'MYTHIC_SHOP' } }, '2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z'),
        store({ shoppefront: { id: 'MYTHIC_SHOP' } }, '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
        store({ shoppefront: { id: 'JADE_SHOP' } }, '2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z'),
        store({ lol: { store: 'sanctum' }, sanctum: { bannerId: 'b1' } }, '2026-07-29T18:00:00Z', '2026-11-04T18:00:00Z'),
    ];
    assert.equal(selectMythicShop(stores, now).length, 1);
    const definition = { id: 'b1', bannerSkin: { id: 122064, name: 'DariusSkin64', rarity: 'kMythic' }, chasePityThreshold: 40, highlightPityThreshold: 10 };
    assert.deepEqual(buildSanctumBanners(stores, [definition], now), [{
        bannerSkin: definition.bannerSkin, startDate: 1785348000, endDate: 1793815200,
        chasePityThreshold: 40, highlightPityThreshold: 10, bannerBackgroundTexture: null,
    }]);
    assert.deepEqual(buildYourShopStatus({ Active: false, PromotionName: 'YS Deactivated' }), {});
});

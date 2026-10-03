import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertLocalSupabase } from '../lib/localMode.js';
import { collectClientSnapshot, readClientSnapshot, saveClientSnapshot } from '../lib/clientSnapshot.js';
import { buildSanctumBanners, buildYourShopStatus, selectMythicShop } from '../lib/riotDirect.js';
import { nextPollAt } from '../lib/pollSchedule.js';
import { publishLinuxRunStatus } from '../lib/linuxRunStatus.js';

test('Linux runner reports failures to the separate status table with bounded requests', async () => {
    const env = { INGESTION_LOCAL_ONLY: 'true', SUPABASE_URL: 'http://127.0.0.1:55421', SUPABASE_KEY: 'test-key' };
    const status = { status: 'error', attempt: 3, updatedAt: '2026-10-02T12:04:00Z', lastResult: 'error' };
    let calls = 0;
    const fetchImpl = async (url, init) => {
        calls++;
        assert.equal(url, 'http://127.0.0.1:55421/rest/v1/linux_ingestion_status?on_conflict=runner_id');
        assert.equal(init.redirect, 'error');
        assert.ok(init.signal);
        assert.equal(init.headers.Authorization, 'Bearer test-key');
        assert.deepEqual(JSON.parse(init.body), {
            runner_id: 'direct', status: 'error', attempt: 3,
            updated_at: status.updatedAt, last_result: 'error',
        });
        return new Response(null, { status: 204 });
    };
    await publishLinuxRunStatus(status, { env, fetchImpl });
    assert.equal(calls, 1);
    await assert.rejects(() => publishLinuxRunStatus(status, {
        env: { ...env, SUPABASE_URL: 'https://example.supabase.co' }, fetchImpl,
    }), /non-loopback/);
    assert.equal(calls, 1);
    await assert.rejects(() => publishLinuxRunStatus({ ...status, attempt: 0 }, { env, fetchImpl }), /Invalid Linux runner/);
    await assert.rejects(() => publishLinuxRunStatus(status, {
        env, fetchImpl: async () => new Response(null, { status: 503 }),
    }), /HTTP 503/);
});

test('polling advances to the next UTC half-hour, including midnight', () => {
    for (const [now, expected] of [
        ['2026-10-02T12:00:00Z', '2026-10-02T12:30:00.000Z'],
        ['2026-10-02T12:29:59Z', '2026-10-02T12:30:00.000Z'],
        ['2026-10-02T12:30:00Z', '2026-10-02T13:00:00.000Z'],
        ['2026-10-02T23:59:59Z', '2026-10-03T00:00:00.000Z'],
    ]) assert.equal(nextPollAt('30', Date.parse(now)).toISOString(), expected);
    for (const invalid of ['', '0', '-30', 'NaN', '7', '90']) {
        assert.throws(() => nextPollAt(invalid), /positive divisor/);
    }
});

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

test('Your Shop requires explicit inactivity or a complete active promotion', () => {
    for (const config of [undefined, null, {}, [], { Active: 'false' }, { Active: 0 }]) {
        assert.throws(() => buildYourShopStatus(config), /missing or invalid/);
    }
    assert.deepEqual(buildYourShopStatus({ Active: false }), {});
    const active = {
        Active: true, PromotionName: 'October shop',
        PromotionStartDate: '2026-10-01T00:00:00Z', PromotionEndDate: '2026-10-10T00:00:00Z',
    };
    assert.deepEqual(buildYourShopStatus(active), {
        name: active.PromotionName, startTime: active.PromotionStartDate,
        endTime: active.PromotionEndDate, hubEnabled: true,
    });
    for (const change of [
        { PromotionName: undefined }, { PromotionName: ' ' },
        { PromotionStartDate: undefined }, { PromotionEndDate: 'invalid' },
        { PromotionEndDate: active.PromotionStartDate },
        { PromotionEndDate: '2026-09-01T00:00:00Z' },
    ]) {
        assert.throws(() => buildYourShopStatus({ ...active, ...change }), /invalid promotion window/);
    }
});

test('missing direct-source data cannot replace the last good snapshot', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rotations-direct-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const before = { schemaVersion: 1, source: 'riot-direct', fetchedAt: new Date().toISOString(), data: {
        catalog: [], mythicShop: [], sanctumBanners: [], yourShopStatus: {},
    } };
    const file = saveClientSnapshot(before, directory);
    const original = fs.readFileSync(file, 'utf8');
    const now = Date.parse('2026-10-02T12:00:00Z');
    const activeStore = {
        startTime: '2026-10-01T00:00:00Z', endTime: '2026-10-10T00:00:00Z',
        displayMetadata: { lol: { store: 'sanctum' }, sanctum: { bannerId: 'new-banner' } },
    };
    for (const map of [
        () => ({ yourShopStatus: buildYourShopStatus(undefined) }),
        () => ({ sanctumBanners: buildSanctumBanners([activeStore], [], now) }),
        () => ({ sanctumBanners: buildSanctumBanners([
            { ...activeStore, displayMetadata: { lol: { store: 'sanctum' } } },
        ], [], now) }),
    ]) {
        assert.throws(() => saveClientSnapshot({ ...before, data: { ...before.data, ...map() } }, directory),
            /Your Shop configuration|no matching banner definition/);
        assert.equal(fs.readFileSync(file, 'utf8'), original);
    }
    // Missing definitions for expired or unrelated stores do not block collection.
    assert.deepEqual(buildSanctumBanners([
        { ...activeStore, endTime: '2026-10-02T00:00:00Z' },
        { ...activeStore, displayMetadata: { lol: { store: 'other' } } },
    ], [], now), []);
});

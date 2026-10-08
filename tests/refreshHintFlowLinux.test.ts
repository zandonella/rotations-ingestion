import assert from 'node:assert/strict';
import test from 'node:test';

test('ingestion hints reflect public data results before operational bookkeeping', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 22, 12) });
    const previousUrl = process.env.ROTATIONS_API_REFRESH_URL;
    const previousSecret = process.env.ROTATIONS_API_REFRESH_SECRET;
    const previousExitCode = process.exitCode;
    const previousPollMinutes = process.env.INGESTION_POLL_INTERVAL_MINUTES;
    delete process.env.INGESTION_POLL_INTERVAL_MINUTES;
    process.env.ROTATIONS_API_REFRESH_URL = 'https://refresh.invalid/internal/refresh';
    process.env.ROTATIONS_API_REFRESH_SECRET = 'test-refresh-secret';
    t.after(() => {
        if (previousUrl === undefined) delete process.env.ROTATIONS_API_REFRESH_URL;
        else process.env.ROTATIONS_API_REFRESH_URL = previousUrl;
        if (previousSecret === undefined) delete process.env.ROTATIONS_API_REFRESH_SECRET;
        else process.env.ROTATIONS_API_REFRESH_SECRET = previousSecret;
        process.exitCode = previousExitCode;
        if (previousPollMinutes === undefined) delete process.env.INGESTION_POLL_INTERVAL_MINUTES;
        else process.env.INGESTION_POLL_INTERVAL_MINUTES = previousPollMinutes;
    });

    t.mock.module('../lib/rotationNotifications.js', { namedExports: {
        readActiveRotations: async () => [], newRotationItems: () => [{}], describeRotationItems: async () => 'new items',
    } });

    let scenario: { fail?: string; empty?: boolean; missingMythic?: boolean; missingSanctum?: boolean; failedYourShop?: boolean; hintFails?: boolean; wakeFails?: boolean };
    let events: string[];
    let heartbeat: { next_expected_at: string; message: string } | undefined;
    let finish: () => void;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.module('../lib/discordLoggerLinux.ts', {
        namedExports: {
            DiscordLogger: class {
                // This deliberately stays true. Hint eligibility must use operation results.
                hasErrors = true;
                hasWarnings = false;
                warn() {}
                error() {}
                async rotationUpdate() { events.push('rotation-notification'); }
                async finish() { finish(); }
            },
        },
    });
    t.mock.module('../lib/supabaseLinux.ts', {
        namedExports: {
            supabase: {
                async rpc() { return { data: true, error: null }; },
                from(table: string) {
                    let operation = '';
                    let columns = '';
                    const query = {
                        select(value: string) { operation = 'select'; columns = value; return query; },
                        upsert(value: typeof heartbeat) {
                            operation = 'upsert';
                            if (table === 'ingestion_heartbeat') heartbeat = value;
                            return query;
                        },
                        update() { operation = 'update'; return query; },
                        in() { return query; },
                        eq() { return query; },
                        neq() { return query; },
                        lt() { return query; },
                        then(resolve: (value: unknown) => void) {
                            const event = `${table}.${operation}`;
                            events.push(event);
                            let data: unknown[] = [];
                            if (table === 'CatalogItem' && operation === 'select') {
                                data = columns === 'ItemID'
                                    ? scenario.missingMythic ? [] : [{ ItemID: 'test-item' }]
                                    : scenario.missingSanctum ? [] : [{ RiotItemID: 1001, ItemType: 1 }];
                            }
                            resolve({ data, error: scenario.fail === event ? { message: 'Mock failure.' } : null });
                        },
                    };
                    return query;
                },
            },
        },
    });
    t.mock.module('fs', {
        defaultExport: {
            existsSync() { return false; },
            writeFileSync() {},
            renameSync() {},
            readFileSync(path: string) {
                const start = new Date(Date.now() - 60_000).toISOString();
                const end = new Date(Date.now() + 60_000).toISOString();
                const sources: Record<string, unknown> = {
                    catalog: scenario.empty ? [] : [{
                        itemId: 1001, inventoryType: 'CHAMPION_SKIN', inactiveDate: null,
                        releaseDate: start, prices: [{ cost: 100, currency: 'RP', discount: 0 }],
                        sale: { startDate: start, endDate: end, prices: [{ cost: 50, currency: 'RP', discount: 0.5 }] },
                    }],
                    mythicShop: scenario.empty ? [] : [{
                        startTime: start, catalogEntries: [{ id: 'offer', endTime: end, purchaseUnits: [{
                            fulfillment: { itemId: 'test-item' },
                            paymentOptions: [{ payments: [{ finalDelta: 100, name: 'lol_mythic_essence' }] }],
                        }] }],
                    }],
                    sanctumBanners: scenario.empty ? [] : [{
                        bannerSkin: { id: 1001, name: 'AnnieSkin1', rarity: 'kExalted' },
                        startDate: Date.parse(start) / 1000, endDate: Date.parse(end) / 1000,
                        chasePityThreshold: 80,
                    }],
                    yourShopStatus: scenario.failedYourShop ? { fetchSucceeded: false }
                        : scenario.empty ? { message: 'No Your Shop available' }
                        : { name: 'test-shop', startTime: start, endTime: end, hubEnabled: true },
                    skins: {},
                };
                const name = path.split('/').at(-1)!.replace('.json', '');
                return JSON.stringify(sources[name] ?? []);
            },
        },
    });
    t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
        if (url === process.env.ROTATIONS_API_REFRESH_URL) {
            events.push('hint');
            assert.equal(options.body, undefined);
            if (scenario.hintFails) throw new Error('Mock connection failure.');
            return new Response(null, { status: 202 });
        }
        assert.equal(url, 'http://100.99.1.41:3000/schedule-wake');
        events.push('wake');
        if (scenario.wakeFails) return new Response(null, { status: 503 });
        return Response.json({ ok: true });
    });

    let run = 0;
    async function execute(script: string, settings: typeof scenario) {
        scenario = settings;
        events = [];
        process.exitCode = 0;
        const done = new Promise<void>(resolve => { finish = resolve; });
        await import(`../${script}Linux.ts?hint-test=${run++}`);
        await done;
        return [...events];
    }

    for (const settings of [{}, { empty: true }, { fail: 'ingestion_heartbeat.upsert' }, { hintFails: true }, { wakeFails: true }]) {
        const result = await execute('processClientData', settings);
        assert.equal(result.filter(event => event === 'hint').length, 1);
        assert.equal(result.filter(event => event === 'rotation-notification').length, 0);
        assert.ok(result.indexOf('hint') < result.indexOf('ingestion_heartbeat.upsert'));
        if (result.includes('wake')) assert.ok(result.indexOf('hint') < result.indexOf('wake'));
        assert.equal(process.exitCode, settings.wakeFails ? 1 : 0);
    }

    for (const fail of [
        'CatalogSale.upsert', 'CatalogSale.update', 'MythicSale.upsert', 'MythicSale.update',
        'CatalogItem.select', 'SanctumSale.upsert', 'SanctumSale.update',
        'YourShopSale.update', 'YourShopSale.upsert',
    ]) {
        const failedEvents = await execute('processClientData', { fail });
        assert.equal(failedEvents.includes('hint'), false, fail);
        assert.equal(failedEvents.includes('rotation-notification'), false, fail);
    }
    for (const settings of [{ failedYourShop: true }]) {
        assert.equal((await execute('processClientData', settings)).includes('hint'), false);
    }

    process.env.INGESTION_POLL_INTERVAL_MINUTES = '60';
    process.env.INGESTION_POLL_OFFSET_MINUTES = '1';
    const pollingEvents = await execute('processClientData', {});
    assert.equal(pollingEvents.includes('wake'), false);
    assert.equal(pollingEvents.includes('hint'), true);
    assert.equal(heartbeat?.next_expected_at, '2026-09-22T12:01:00.000Z');
    assert.match(heartbeat?.message ?? '', /Polling every 60 minutes at offset 1/);
    assert.equal(process.exitCode, 0);
    process.env.INGESTION_POLL_INTERVAL_MINUTES = 'invalid';
    assert.deepEqual(await execute('processClientData', {}), []);
    assert.equal(process.exitCode, 1);
    delete process.env.INGESTION_POLL_INTERVAL_MINUTES;
    delete process.env.INGESTION_POLL_OFFSET_MINUTES;

    process.env.DEFER_PUBLIC_API_PUBLICATION = 'true';
    assert.equal((await execute('processStaticData', {})).includes('hint'), false);
    delete process.env.DEFER_PUBLIC_API_PUBLICATION;
    const staticEvents = await execute('processStaticData', {});
    assert.equal(staticEvents.filter(event => event === 'hint').length, 1);
    assert.equal(staticEvents.at(-1), 'hint');
    assert.equal(staticEvents.filter(event => event === 'CatalogItem.upsert').length, 5);
    assert.equal((await execute('processStaticData', { hintFails: true })).filter(event => event === 'hint').length, 1);
    assert.equal(process.exitCode, 0);
    for (const fail of ['Champion.upsert', 'Universe.upsert', 'Skinline.upsert', 'CatalogItem.upsert']) {
        assert.equal((await execute('processStaticData', { fail })).includes('hint'), false);
        assert.equal(process.exitCode, 1);
    }
});

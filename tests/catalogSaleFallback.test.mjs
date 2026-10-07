import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { upsertCatalogWithFallback } from '../lib/catalogSaleFallback.js';
import { newRotationItems } from '../lib/rotationNotifications.js';
const fk = { code: '23503', message: 'violates foreign key constraint "CatalogSale_ItemType_SkinID_fkey"' };
const sale = id => ({ ItemType: 1, RiotItemID: id, SaleStartAt: '2026-10-07T00:00:00Z' });
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-fallback-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const existing = new Set([1]);
    const stored = new Map();
    const writes = [], reads = [], warnings = [];
    const options = {
        cacheFile: path.join(root, 'cache.json'),
        async upsert(rows) {
            writes.push(rows);
            if (rows.some(row => !existing.has(row.RiotItemID))) return { error: fk };
            for (const row of rows) stored.set(row.RiotItemID, row);
            return { error: null };
        },
        async lookup(type, ids) {
            reads.push(ids);
            return { data: ids.filter(id => existing.has(id)).map(sale), error: null };
        },
        warn: row => warnings.push(row),
    };
    return { options, existing, stored, writes, reads, warnings };
}
test('6000 known items upsert with zero lookup requests', async t => {
    const f = fixture(t), rows = Array.from({ length: 6000 }, (_, i) => sale(i));
    rows.forEach(row => f.existing.add(row.RiotItemID));
    assert.equal(await upsertCatalogWithFallback(rows, f.options), true);
    assert.equal(f.reads.length, 0);
    assert.equal(f.writes.length, 1);
});
test('unknown items warn; known identities are cached; later recovery creates a new-sale addition', async t => {
    const f = fixture(t), rows = [sale(1), sale(2)];
    await upsertCatalogWithFallback([sale(1)], f.options);
    await upsertCatalogWithFallback(rows, f.options);
    assert.deepEqual(f.reads, [[2]]);
    assert.deepEqual([...f.stored.keys()], [1]);
    assert.deepEqual(f.warnings.map(row => row.RiotItemID), [2]);
    await upsertCatalogWithFallback(rows, f.options);
    assert.deepEqual(f.reads, [[2], [2]]);
    const rotation = { table: 'CatalogSale', keys: ['ItemType', 'RiotItemID', 'SaleStartAt'] };
    const before = [...f.stored.values()].map(sale => ({ rotation, sale }));
    f.existing.add(2);
    await upsertCatalogWithFallback(rows, f.options);
    const additions = newRotationItems(before, [...f.stored.values()].map(sale => ({ rotation, sale })));
    assert.deepEqual(additions.map(entry => entry.sale.RiotItemID), [2]);
    const reads = f.reads.length;
    await upsertCatalogWithFallback(rows, f.options);
    assert.equal(f.reads.length, reads);
});
test('all unknown items succeed with warnings; lookup batches remain under response limits', async t => {
    const f = fixture(t);
    f.existing.clear();
    const rows = Array.from({ length: 6000 }, (_, i) => sale(i));
    await upsertCatalogWithFallback(rows, f.options);
    assert.equal(f.warnings.length, 6000);
    assert.equal(f.reads.length, 20);
    assert.ok(f.reads.every(ids => ids.length <= 300));
    assert.equal(f.writes.length, 1);
});
test('stale positive cache is rechecked after an item is deleted', async t => {
    const f = fixture(t);
    await upsertCatalogWithFallback([sale(1)], f.options);
    f.existing.clear();
    await upsertCatalogWithFallback([sale(1)], f.options);
    assert.deepEqual(f.reads, [[1]]);
    assert.equal(f.warnings.length, 1);
});
test('unrelated database failures remain errors and never trigger fallback', async t => {
    const f = fixture(t);
    for (const error of [{ code: '42501', message: 'permission denied' }, { code: '23503', message: 'another_fk' }]) {
        await assert.rejects(upsertCatalogWithFallback([sale(1)], { ...f.options, upsert: async () => ({ error }) }), new RegExp(error.message));
    }
    assert.equal(f.reads.length, 0);
    await assert.rejects(upsertCatalogWithFallback([sale(2)], { ...f.options, lookup: async () => ({ error: { message: 'lookup failed' } }) }), /lookup failed/);
});

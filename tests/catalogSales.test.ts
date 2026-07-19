import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogSaleRecord } from '../lib/types.js';
import { dedupeCatalogSales } from '../lib/catalogSales.ts';

function makeSale(
    overrides: Partial<CatalogSaleRecord> = {},
): CatalogSaleRecord {
    return {
        RiotItemID: 21069,
        ItemType: 1,
        SaleStartAt: new Date('2026-07-15T18:00:00.000Z'),
        SaleEndAt: new Date('2026-07-29T18:00:00.000Z'),
        NormalPrice: 1820,
        SalePrice: 1820,
        PercentOff: 0,
        Currency: 'RP',
        IsActive: true,
        Limited: true,
        ...overrides,
    };
}

test('uses the latest end date when one response contains two versions', () => {
    const originalSale = makeSale();
    const extendedSale = makeSale({
        SaleEndAt: new Date('2026-11-18T19:00:00.000Z'),
    });

    const result = dedupeCatalogSales([originalSale, extendedSale]);

    assert.deepEqual(result, [extendedSale]);
});

test('allows a later snapshot to shorten the stored end date', () => {
    const correctedSale = makeSale();

    const result = dedupeCatalogSales([correctedSale]);

    assert.deepEqual(result, [correctedSale]);
});

test('keeps sales with different exact start times separate', () => {
    const firstSale = makeSale();
    const laterSale = makeSale({
        SaleStartAt: new Date('2026-07-15T19:00:00.000Z'),
    });

    const result = dedupeCatalogSales([firstSale, laterSale]);

    assert.deepEqual(result, [firstSale, laterSale]);
});

test('keeps identical Riot item IDs from different item types separate', () => {
    const skinSale = makeSale();
    const chromaSale = makeSale({ ItemType: 2 });

    const result = dedupeCatalogSales([skinSale, chromaSale]);

    assert.deepEqual(result, [skinSale, chromaSale]);
});

test('preserves limited classification across duplicate source rows', () => {
    const regularSale = makeSale({ Limited: false });
    const limitedSale = makeSale({
        SaleEndAt: new Date('2026-11-18T19:00:00.000Z'),
        Limited: true,
    });

    const result = dedupeCatalogSales([regularSale, limitedSale]);

    assert.equal(result.length, 1);
    assert.equal(result[0].Limited, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isActiveYourShopStatus,
    minimizeYourShopStatus,
} from '../lib/yourShop.ts';

const activeStatus = {
    endTime: '2026-08-18T17:00:00.000+00:00',
    hubEnabled: true,
    name: 'YS3.2026',
    startTime: '2026-07-21T17:00:00.000+00:00',
};

test('recognizes the active Your Shop response shape', () => {
    assert.equal(isActiveYourShopStatus(activeStatus), true);
});

test('rejects a basic inactive response', () => {
    assert.equal(
        isActiveYourShopStatus({ message: 'No Your Shop available' }),
        false,
    );
});

test('rejects invalid or reversed window dates', () => {
    assert.equal(
        isActiveYourShopStatus({
            ...activeStatus,
            startTime: activeStatus.endTime,
        }),
        false,
    );
});

test('maps an active status to the database record', () => {
    const sale = minimizeYourShopStatus(
        activeStatus,
        new Date('2026-07-21T18:00:00.000Z'),
    );

    assert.deepEqual(sale, {
        ShopName: 'YS3.2026',
        SaleStartAt: new Date('2026-07-21T17:00:00.000Z'),
        SaleEndAt: new Date('2026-08-18T17:00:00.000Z'),
        HubEnabled: true,
        IsActive: true,
    });
});

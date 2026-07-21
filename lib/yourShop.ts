import type { RawYourShopStatus, YourShopSaleRecord } from './types.js';

export function isActiveYourShopStatus(
    value: unknown,
): value is RawYourShopStatus {
    if (typeof value !== 'object' || value === null) return false;

    const status = value as Record<string, unknown>;
    const hasActiveShape =
        typeof status.name === 'string' &&
        status.name.length > 0 &&
        typeof status.startTime === 'string' &&
        !Number.isNaN(Date.parse(status.startTime)) &&
        typeof status.endTime === 'string' &&
        !Number.isNaN(Date.parse(status.endTime)) &&
        typeof status.hubEnabled === 'boolean';

    return (
        hasActiveShape &&
        Date.parse(status.startTime as string) <
            Date.parse(status.endTime as string)
    );
}

export function minimizeYourShopStatus(
    status: RawYourShopStatus,
    now: Date = new Date(),
): YourShopSaleRecord {
    const saleStartAt = new Date(status.startTime);
    const saleEndAt = new Date(status.endTime);

    return {
        ShopName: status.name,
        SaleStartAt: saleStartAt,
        SaleEndAt: saleEndAt,
        HubEnabled: status.hubEnabled,
        IsActive: status.hubEnabled && saleStartAt <= now && now < saleEndAt,
    };
}

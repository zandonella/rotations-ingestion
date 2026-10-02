import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CLIENT_ENDPOINTS, positiveInteger } from './lcuClient.js';

export const SNAPSHOT_NAME = 'clientSnapshot.json';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const price = value => object(value) && Number.isFinite(value.cost) && typeof value.currency === 'string';

export function validateClientData(data) {
    if (!object(data)) throw new Error('Client snapshot has no data object.');
    for (const name of ['catalog', 'mythicShop', 'sanctumBanners']) {
        if (!Array.isArray(data[name])) throw new Error(`${name} must be an array; refusing to publish incomplete data.`);
    }
    for (const row of data.catalog) {
        if (!object(row) || !Number.isSafeInteger(row.itemId) || typeof row.inventoryType !== 'string' ||
            !Array.isArray(row.prices) || !row.prices.every(price) || !date(row.releaseDate) ||
            (row.inactiveDate != null && !date(row.inactiveDate)) ||
            (row.sale != null && (!object(row.sale) || !date(row.sale.startDate) || !date(row.sale.endDate) ||
                !Array.isArray(row.sale.prices) || !row.sale.prices.every(price)))) {
            throw new Error('Catalog contains an invalid item.');
        }
    }
    for (const row of data.mythicShop) {
        if (!object(row) || !date(row.startTime) || !Array.isArray(row.catalogEntries)) throw new Error('Mythic shop contains an invalid offer.');
        for (const entry of row.catalogEntries) {
            if (!object(entry) || !date(entry.endTime) || typeof entry.id !== 'string' || !Array.isArray(entry.purchaseUnits) ||
                entry.purchaseUnits.some(unit => !object(unit) || typeof unit.fulfillment?.itemId !== 'string' ||
                    (unit.paymentOptions != null && (!Array.isArray(unit.paymentOptions) || unit.paymentOptions.some(option =>
                        !Array.isArray(option.payments) || option.payments.length === 0 || option.payments.some(payment =>
                            !Number.isFinite(payment.finalDelta) || typeof payment.name !== 'string')))))) {
                throw new Error('Mythic shop contains an invalid catalog entry.');
            }
        }
    }
    for (const row of data.sanctumBanners) {
        if (!object(row) || !Number.isSafeInteger(row.bannerSkin?.id) || typeof row.bannerSkin?.name !== 'string' ||
            !Number.isFinite(row.startDate) || !Number.isFinite(row.endDate) || !Number.isFinite(row.chasePityThreshold)) {
            throw new Error('Sanctum contains an invalid banner.');
        }
    }
    const status = data.yourShopStatus;
    if (!object(status) || 'errorCode' in status || status.fetchSucceeded === false) throw new Error('Your Shop status is unavailable.');
    // An explicit inactive response is valid; an incomplete active window is not.
    if ('startTime' in status || 'endTime' in status || 'name' in status) {
        if (typeof status.name !== 'string' || !status.name || !date(status.startTime) || !date(status.endTime) ||
            Date.parse(status.startTime) >= Date.parse(status.endTime) || typeof status.hubEnabled !== 'boolean') {
            throw new Error('Your Shop contains an invalid window.');
        }
    }
    return data;
}

export async function collectClientSnapshot(client, { now = new Date() } = {}) {
    const data = {};
    // Only four read-only requests. A failure prevents publication of the entire snapshot.
    for (const [name, endpoint] of Object.entries(CLIENT_ENDPOINTS)) data[name] = await client.get(endpoint);
    validateClientData(data);
    return { schemaVersion: 1, fetchedAt: now.toISOString(), source: 'lcu', data };
}

export function saveClientSnapshot(snapshot, directory) {
    validateClientData(snapshot.data);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const destination = path.join(directory, SNAPSHOT_NAME);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify(snapshot, null, 2), { mode: 0o600, flag: 'wx' });
        fs.renameSync(temporary, destination);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
    return destination;
}

export function readClientSnapshot(directory, { maxAgeSeconds = 1800, now = Date.now() } = {}) {
    const file = path.join(directory, SNAPSHOT_NAME);
    if (!fs.existsSync(file)) return null;
    let snapshot;
    try { snapshot = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {
        throw new Error('Client snapshot is unreadable; fetch it again.');
    }
    const maxAge = positiveInteger(maxAgeSeconds, 1800, 'CLIENT_SNAPSHOT_MAX_AGE_SECONDS') * 1000;
    const age = now - Date.parse(snapshot.fetchedAt);
    if (snapshot.schemaVersion !== 1 || !Number.isFinite(age) || age < -60_000 || age > maxAge) {
        throw new Error('Client snapshot is stale or invalid; fetch a fresh snapshot before processing.');
    }
    return validateClientData(snapshot.data);
}

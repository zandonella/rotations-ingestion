import fs from 'fs';
import type {
    CatalogSaleRecord,
    MythicSaleRecord,
    RawCatalogSale,
    RawMythicSale,
    sectionType,
    price,
} from './lib/types.js';
import { supabase } from './lib/supabase.ts';
import { DiscordLogger } from './lib/discordLogger.ts';

const logger = new DiscordLogger('processClientData');

// helpers
function minDate(a: Date | null, b: Date | null): Date | null {
    if (a === null) return b;
    if (b === null) return a;
    return a.getTime() < b.getTime() ? a : b;
}

function getPriceInfo(prices: price[], preferredCurrency?: string): price {
    const nonZeroPrices = prices.filter((p) => p.cost != 0);
    const price =
        (preferredCurrency
            ? nonZeroPrices.find((p) => p.currency === preferredCurrency)
            : undefined) ??
        nonZeroPrices.find((p) => p.currency === 'IP') ??
        nonZeroPrices.find((p) => p.currency === 'RP') ??
        nonZeroPrices[0];
    if (!price) {
        return { cost: 0, currency: 'UNKNOWN', discount: 0 };
    }
    return price;
}

function getCatalogPriceInfo(sale: RawCatalogSale) {
    const salePriceInfo = sale.sale
        ? getPriceInfo(sale.sale.prices)
        : getPriceInfo(sale.prices);
    const normalPriceInfo = getPriceInfo(sale.prices, salePriceInfo.currency);

    return {
        normalPrice:
            normalPriceInfo.currency === salePriceInfo.currency
                ? normalPriceInfo.cost
                : salePriceInfo.cost,
        salePrice: salePriceInfo.cost,
        discount: sale.sale ? salePriceInfo.discount : 0,
        currency: salePriceInfo.currency,
    };
}

function getItemTypeByName(name: string) {
    switch (name) {
        case 'CHAMPION_SKIN':
            return 1;
        case 'RECOLOR':
            return 2;
        case 'EMOTE':
            return 3;
        case 'SUMMONER_ICON':
            return 4;
        case 'WARD_SKIN':
            return 6;
        default:
            return 0;
    }
}

function hasLimitedAvailabilityTag(sale: RawCatalogSale) {
    return (
        sale.tags?.some((tag) => tag.toLowerCase().includes('limited')) ?? false
    );
}

function filterCatalogSales(salesData: RawCatalogSale[]) {
    salesData = salesData.filter((sale) => sale.sale != null);
    salesData = salesData.filter(
        (sale) =>
            sale.inventoryType == 'CHAMPION_SKIN' ||
            sale.inventoryType == 'EMOTE' ||
            sale.inventoryType == 'SUMMONER_ICON' ||
            sale.inventoryType == 'WARD_SKIN' ||
            sale.subInventoryType == 'RECOLOR',
    );
    salesData = salesData.filter((sale) => !hasLimitedAvailabilityTag(sale));
    return salesData;
}

function getLimitedSales(salesData: RawCatalogSale[]) {
    salesData = salesData.filter((sale) => sale.inactiveDate != null);
    salesData = salesData.filter((sale) => hasLimitedAvailabilityTag(sale));
    salesData = salesData.filter(
        (sale) => sale.inventoryType == 'CHAMPION_SKIN',
    );
    salesData = salesData.filter((sale) => {
        const inactiveDate = new Date(sale.inactiveDate!);
        const now = new Date();
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
        return inactiveDate > now && inactiveDate < sixMonthsFromNow;
    });

    return salesData;
}

function minimizeCatalogSale(sales: RawCatalogSale[]): CatalogSaleRecord[] {
    const minimizedSales = sales.map((sale) => {
        const rawStartDate = new Date(sale.sale!.startDate);
        const rawEndDate = new Date(sale.sale!.endDate);
        const priceInfo = getCatalogPriceInfo(sale);

        const now = new Date();
        const isActive = rawStartDate <= now && rawEndDate > now;

        let itemType;

        if (sale.subInventoryType === 'RECOLOR') {
            itemType = getItemTypeByName(sale.subInventoryType);
        } else {
            itemType = getItemTypeByName(sale.inventoryType);
        }

        // rawStartDate.setHours(rawStartDate.getHours() + 6);
        // rawEndDate.setHours(rawEndDate.getHours() + 6);
        return {
            RiotItemID: sale.itemId,
            SaleStartAt: rawStartDate,
            SaleEndAt: rawEndDate,
            ItemType: itemType,
            NormalPrice: priceInfo.normalPrice,
            SalePrice: priceInfo.salePrice,
            PercentOff: Math.round(priceInfo.discount * 100),
            Currency: priceInfo.currency,
            IsActive: isActive,
            Limited: false,
        };
    });
    return minimizedSales;
}

function minimizeLimitedSale(sales: RawCatalogSale[]): CatalogSaleRecord[] {
    const minimizedSales = sales.map((sale) => {
        const rawStartDate = new Date(sale.releaseDate);
        const rawEndDate = new Date(sale.inactiveDate!);
        const priceInfo = getCatalogPriceInfo(sale);

        const now = new Date();
        const isActive = rawStartDate <= now && rawEndDate > now;

        let itemType;

        if (sale.subInventoryType === 'RECOLOR') {
            itemType = getItemTypeByName(sale.subInventoryType);
        } else {
            itemType = getItemTypeByName(sale.inventoryType);
        }

        // rawStartDate.setHours(rawStartDate.getHours() + 6);
        // rawEndDate.setHours(rawEndDate.getHours() + 6);
        return {
            RiotItemID: sale.itemId,
            SaleStartAt: rawStartDate,
            SaleEndAt: rawEndDate,
            ItemType: itemType,
            NormalPrice: priceInfo.normalPrice,
            SalePrice: priceInfo.salePrice,
            PercentOff: Math.round(priceInfo.discount * 100),
            Currency: priceInfo.currency,
            IsActive: isActive,
            Limited: true,
        };
    });
    return minimizedSales;
}

function dedupeSales(sales: CatalogSaleRecord[]) {
    const map = new Map<string, CatalogSaleRecord>();

    for (const sale of sales) {
        const key = `${sale.RiotItemID}-${sale.SaleStartAt.toISOString()}-${sale.SaleEndAt.toISOString()}`;
        if (!map.has(key)) {
            map.set(key, sale);
        }
    }
    return Array.from(map.values());
}

function getPrimaryPurchaseUnit(entry: RawMythicSale['catalogEntries'][0]) {
    // find first unit with payment options
    const unitWithPayment = entry.purchaseUnits.find(
        (unit) => unit.paymentOptions && unit.paymentOptions.length > 0,
    );

    return unitWithPayment;
}

function getAllIncludedItems(entry: RawMythicSale['catalogEntries'][0]) {
    const itemIds = entry.purchaseUnits.map((unit) => unit.fulfillment.itemId);

    return itemIds;
}

function minimizeMythicSale(sales: RawMythicSale[]): MythicSaleRecord[] {
    const now = new Date();

    const minimizedSales = sales.flatMap((sale) => {
        const section =
            sale.displayMetadata?.shoppefront?.categories[0] ??
            ('FEATURED' as sectionType);

        const saleStartAt = new Date(sale.startTime);

        return sale.catalogEntries.flatMap((entry) => {
            const primaryPurchaseUnit = getPrimaryPurchaseUnit(entry);

            if (!primaryPurchaseUnit) {
                return [];
            }
            const payment = primaryPurchaseUnit.paymentOptions![0].payments[0];
            const saleEndAt = new Date(entry.endTime);

            const includedItems = getAllIncludedItems(entry);

            const isBundle =
                entry.displayMetadata?.type?.toUpperCase() === 'BUNDLE' ||
                includedItems.length > 1;

            return {
                OfferID: entry.id,
                PrimaryItemID: primaryPurchaseUnit.fulfillment.itemId,
                SaleStartAt: saleStartAt,
                SaleEndAt: saleEndAt,
                Price: payment.finalDelta,
                Currency:
                    payment.name === 'lol_mythic_essence' ? 'ME' : 'UNKNOWN',
                IsActive: saleStartAt <= now && saleEndAt >= now,
                Section: section.toUpperCase() as sectionType,
                IsBundle: isBundle,
                IncludedItems: includedItems,
                BundleType:
                    entry.displayMetadata?.shoppefront?.bundleType || null,
            };
        });
    });
    return minimizedSales;
}

// proccessing functions
function processCatalogSales(): CatalogSaleRecord[] {
    const salesJsonData = fs.readFileSync('data/source/catalog.json', 'utf8');
    const salesData = JSON.parse(salesJsonData) as RawCatalogSale[];
    const filteredSales = filterCatalogSales(salesData);
    const limitedSales = getLimitedSales(salesData);

    const minimizedSales = minimizeCatalogSale(filteredSales);
    const minimizedLimitedSales = minimizeLimitedSale(limitedSales);

    return minimizedSales.concat(minimizedLimitedSales);
}

function processMythicSales() {
    const salesJsonData = fs.readFileSync(
        'data/source/mythicShop.json',
        'utf8',
    );
    const salesData = JSON.parse(salesJsonData);

    const minimizedSales = minimizeMythicSale(salesData);

    return minimizedSales;
}

// upsert functions
async function upsertCatalogSales(sales: CatalogSaleRecord[]) {
    const { error } = await supabase.from('CatalogSale').upsert(sales, {
        onConflict: 'RiotItemID,SaleStartAt,SaleEndAt',
    });

    if (error) {
        console.error('Error upserting catalog sales:', error);
        await logger.error('Error upserting catalog sales.');
    } else {
        console.log('Catalog sales upserted successfully.');
    }
}

async function upsertMythicSales(sales: MythicSaleRecord[]) {
    const primaryIds = [...new Set(sales.map((s) => s.PrimaryItemID))];

    const { data: existingItems, error: existingError } = await supabase
        .from('CatalogItem')
        .select('ItemID')
        .in('ItemID', primaryIds);

    if (existingError) {
        console.error('Error fetching existing catalog items:', existingError);
        await logger.error(
            'Error fetching existing catalog items before MythicSale upsert.',
        );
        return;
    }

    const existingIdSet = new Set(existingItems.map((item) => item.ItemID));

    const validSales = sales.filter((sale) =>
        existingIdSet.has(sale.PrimaryItemID),
    );
    const skippedSales = sales.filter(
        (sale) => !existingIdSet.has(sale.PrimaryItemID),
    );

    if (skippedSales.length > 0) {
        const skippedSaleDetails = skippedSales.map((s) => ({
            OfferID: s.OfferID,
            PrimaryItemID: s.PrimaryItemID,
            Section: s.Section,
            BundleType: s.BundleType,
        }));

        console.warn(
            'Skipping mythic sales with missing CatalogItem rows:',
            skippedSaleDetails,
        );
        await logger.warn(
            'Skipping mythic sales with missing CatalogItem rows.',
        );
    }

    if (validSales.length === 0) {
        console.log('No valid mythic sales to upsert.');
        return;
    }

    const { error } = await supabase.from('MythicSale').upsert(validSales, {
        onConflict: 'SaleStartAt,PrimaryItemID,Section,SaleEndAt',
    });

    if (error) {
        console.error('Error upserting mythic sales:', error);
        await logger.error('Error upserting mythic sales.');
    } else {
        console.log('Mythic sales upserted successfully.');
    }
}

async function deactivateOldSales(table: 'CatalogSale' | 'MythicSale') {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from(table)
        .update({ IsActive: false })
        .lt('SaleEndAt', now);

    if (error) {
        console.error('Error deactivating old sales:', error);
        await logger.error(`Error deactivating old sales in ${table}.`);
    } else {
        console.log('Old sales deactivated successfully.');
    }
}

function getUTCMidnight(date: Date) {
    const result = new Date(date);
    result.setUTCHours(0, 0, 0, 0);
    return result;
}

function getNextRefresh(from: Date) {
    const next = getUTCMidnight(from);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

function getNextRefreshBeforeDefault(
    sales: CatalogSaleRecord[] | MythicSaleRecord[],
) {
    const now = new Date();

    const currentDayUTCMidnight = getUTCMidnight(now);
    const nextDefaultRefresh = getNextRefresh(now);

    console.log(
        currentDayUTCMidnight.toISOString(),
        nextDefaultRefresh.toISOString(),
    );

    let earliest: Date | null = null;

    for (const sale of sales) {
        const saleEnd = sale.SaleEndAt;
        const time = saleEnd.getTime();

        if (
            time > currentDayUTCMidnight.getTime() &&
            time < nextDefaultRefresh.getTime()
        ) {
            if (!earliest || time < earliest.getTime()) {
                earliest = saleEnd;
            }
        }
    }

    return earliest;
}

async function scheduleNextRefresh(nextRefresh: Date) {
    const res = await fetch('http://100.99.1.41:3000/schedule-wake', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            wake_at: nextRefresh.toISOString(),
        }),
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    console.log(await res.json());
}

async function writeHeartbeat(nextExpectedAt: Date, message?: string) {
    const { error } = await supabase.from('ingestion_heartbeat').upsert({
        script_name: 'processClientData',
        last_run_at: new Date().toISOString(),
        next_expected_at: nextExpectedAt.toISOString(),
        status: logger.hasErrors ? 'error' : logger.hasWarnings ? 'warn' : 'ok',
        message: message ?? null,
    });

    if (error) {
        console.error('Error writing ingestion heartbeat:', error);
        await logger.warn('Failed to write ingestion heartbeat.');
    }
}

// main function
async function main() {
    const sales = dedupeSales(processCatalogSales());
    await upsertCatalogSales(sales);
    await deactivateOldSales('CatalogSale');

    const mythicSales = processMythicSales();
    await upsertMythicSales(mythicSales);
    await deactivateOldSales('MythicSale');

    const nextCatalogRefresh = getNextRefreshBeforeDefault(sales);
    const nextMythicRefresh = getNextRefreshBeforeDefault(mythicSales);

    console.log('Next Catalog Refresh:', nextCatalogRefresh);
    console.log('Next Mythic Refresh:', nextMythicRefresh);

    const nextRefresh = minDate(nextCatalogRefresh, nextMythicRefresh);
    console.log('Overall Next Refresh:', nextRefresh);

    let heartbeatMessage: string | undefined;

    if (nextRefresh) {
        try {
            await scheduleNextRefresh(nextRefresh);
        } catch (error) {
            console.error('Error scheduling next refresh:', error);
            await logger.error('Failed to schedule next wake-up.');
            heartbeatMessage = 'Wake scheduling failed.';
            process.exitCode = 1;
        }
    } else {
        // Normal case: no sale ends before the default 5pm PDT wake, so the
        // Pi's systemd timer covers the next refresh on its own.
        console.log('No upcoming sales found to schedule a refresh; default wake covers it.');
        heartbeatMessage = 'No wake scheduled; no upcoming sales.';
    }

    await writeHeartbeat(
        nextRefresh ?? getNextRefresh(new Date()),
        heartbeatMessage,
    );
}

main()
    .then(async () => {
        await logger.finish();
    })
    .catch(async (error: unknown) => {
        console.error('Unexpected error during client data processing:', error);
        await logger.error('Unexpected error during client data processing.');
        await logger.finish();
        process.exitCode = 1;
    });

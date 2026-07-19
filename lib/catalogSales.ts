import type { CatalogSaleRecord } from './types.js';

function getCatalogSaleIdentity(sale: CatalogSaleRecord) {
    return [
        sale.ItemType,
        sale.RiotItemID,
        sale.SaleStartAt.toISOString(),
    ].join(':');
}

export function dedupeCatalogSales(sales: CatalogSaleRecord[]) {
    const salesByIdentity = new Map<string, CatalogSaleRecord>();

    for (const sale of sales) {
        const identity = getCatalogSaleIdentity(sale);
        const existingSale = salesByIdentity.get(identity);

        if (!existingSale) {
            salesByIdentity.set(identity, sale);
            continue;
        }

        const preferredSale =
            sale.SaleEndAt > existingSale.SaleEndAt ? sale : existingSale;

        salesByIdentity.set(identity, {
            ...preferredSale,
            Limited: sale.Limited || existingSale.Limited,
        });
    }

    return Array.from(salesByIdentity.values());
}

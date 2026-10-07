import fs from 'fs';

const key = row => `${row.ItemType}:${row.RiotItemID}`;
export function missingCatalogItem(error) {
    return error?.code === '23503' && /CatalogSale_ItemType_SkinID_fkey/.test(error.message ?? '');
}

// Successful writes require no reads. Only the specific item FK failure triggers lookup.
export async function upsertCatalogWithFallback(sales, { upsert, lookup, cacheFile, warn }) {
    if (sales.length === 0) return true;
    const initial = await upsert(sales);
    if (initial.error && !missingCatalogItem(initial.error)) throw new Error(initial.error.message);
    let confirmed = new Set();
    if (cacheFile && fs.existsSync(cacheFile)) confirmed = new Set(JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
    const save = () => {
        if (!cacheFile) return;
        fs.writeFileSync(`${cacheFile}.tmp`, JSON.stringify([...confirmed]), { mode: 0o600 });
        fs.renameSync(`${cacheFile}.tmp`, cacheFile);
    };
    if (!initial.error) {
        for (const sale of sales) confirmed.add(key(sale));
        save();
        return true;
    }
    const identities = [...new Map(sales.map(sale => [key(sale), sale])).values()];
    const resolve = async rows => {
        for (const type of new Set(rows.map(row => row.ItemType))) {
            const ids = rows.filter(row => row.ItemType === type).map(row => row.RiotItemID);
            for (let offset = 0; offset < ids.length; offset += 300) {
                const { data, error } = await lookup(type, ids.slice(offset, offset + 300));
                if (error) throw new Error(error.message);
                for (const row of data) confirmed.add(key(row));
            }
        }
    };
    await resolve(identities.filter(row => !confirmed.has(key(row))));
    let valid = sales.filter(row => confirmed.has(key(row)));
    let retry = valid.length ? await upsert(valid) : { error: null };
    // A deleted DB item must not be hidden by an old local cache.
    if (missingCatalogItem(retry.error)) {
        confirmed.clear();
        await resolve(identities);
        valid = sales.filter(row => confirmed.has(key(row)));
        retry = valid.length ? await upsert(valid) : { error: null };
    }
    if (retry.error) throw new Error(retry.error.message);
    save();
    for (const row of identities.filter(row => !confirmed.has(key(row)))) warn(row);
    return true;
}

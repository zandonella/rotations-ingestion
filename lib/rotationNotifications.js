// Compare active rotation membership, ignoring price/end-date corrections.
const rotations = [
    { table: 'CatalogSale', label: 'Catalog', keys: ['ItemType', 'RiotItemID', 'SaleStartAt'] },
    { table: 'MythicSale', label: 'Mythic Shop', keys: ['PrimaryItemID', 'Section', 'SaleStartAt'] },
    { table: 'SanctumSale', label: 'Sanctum', keys: ['RiotItemID', 'SaleStartAt'] },
];

export function rotationIdentity(rotation, sale) {
    return JSON.stringify([rotation.table, ...rotation.keys.map(key =>
        key === 'SaleStartAt' ? new Date(sale[key]).toISOString() : sale[key])]);
}

export async function readActiveRotations(db) {
    const entries = [];
    for (const rotation of rotations) {
        for (let offset = 0; ; offset += 500) {
            let query = db.from(rotation.table).select('*').eq('IsActive', true);
            for (const key of rotation.keys) query = query.order(key);
            const { data, error } = await query.range(offset, offset + 499);
            if (error) throw new Error(`Cannot read ${rotation.table}: ${error.message}`);
            entries.push(...data.map(sale => ({ rotation, sale })));
            if (data.length < 500) break;
        }
    }
    return entries;
}

export function newRotationItems(before, after) {
    const seen = new Set(before.map(({ rotation, sale }) => rotationIdentity(rotation, sale)));
    return after.filter(({ rotation, sale }) => {
        const key = rotationIdentity(rotation, sale);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function describeRotationItems(db, entries) {
    const lines = [];
    for (const { rotation, sale } of entries.slice(0, 50)) {
        let query = db.from('CatalogItem').select('Name');
        query = rotation.table === 'MythicSale'
            ? query.eq('ItemID', sale.PrimaryItemID)
            : query.eq('RiotItemID', sale.RiotItemID).eq('ItemType', sale.ItemType);
        const { data, error } = await query.limit(1);
        if (error) throw new Error(`Cannot resolve rotation item name: ${error.message}`);
        const name = data?.[0]?.Name ?? `Item ${sale.PrimaryItemID ?? sale.RiotItemID}`;
        // Keep all 50 lines within Discord's message/embed limits and neutralize mentions.
        const safeName = name.replace(/[\r\n\t]+/g, ' ').replace(/[@*_~`<>\\]/g, '').slice(0, 60);
        lines.push(`• ${rotation.label}: ${safeName}`);
    }
    return formatRotationMessage(entries.length, lines);
}

export function formatRotationMessage(total, lines) {
    const summary = `Rotation update succeeded: ${total} new item${total === 1 ? '' : 's'}.`;
    const omitted = total > 50 ? `\n…and ${total - 50} more (showing the first 50).` : '';
    return `${summary}\n${lines.slice(0, 50).join('\n')}${omitted}`;
}

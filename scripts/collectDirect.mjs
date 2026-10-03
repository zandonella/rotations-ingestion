// Collect clientSnapshot.json from Riot services via a signed-in Riot Client (no League client needed).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDirect } from '../lib/riotDirect.js';
import { saveClientSnapshot } from '../lib/clientSnapshot.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const directory = process.env.CLIENT_DATA_DIRECTORY || path.join(root, 'data/source');
try {
    const data = await collectDirect();
    const file = saveClientSnapshot({ schemaVersion: 1, fetchedAt: new Date().toISOString(), source: 'riot-direct', data }, directory);
    console.log(`Saved ${file}: ${data.catalog.length} catalog items, ${data.mythicShop.length} Mythic Shop stores, ` +
        `${data.sanctumBanners.length} Sanctum banners, Your Shop ${data.yourShopStatus.name ? 'active' : 'inactive'}.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode === 75 ? 75 : 20;
}

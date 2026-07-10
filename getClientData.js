import { HasagiClient } from '@hasagi/core';
import fs from 'fs';

const client = new HasagiClient();

try {
    await client.connect({
        useWebSocket: false,
        maxConnectionAttempts: 12,
        delayBetweenAttempts: 5000,
    });
} catch (error) {
    console.error('Failed to connect to client. Exiting script.');
    process.exit(20);
}

console.log('Connected to client successfully');

let storesLoaded = false;
const maxRetries = 5;
let retries = 0;
let delay = 5000;

while (!storesLoaded && retries < maxRetries) {
    try {
        // Wait for 5 seconds
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Check store status
        const storeStatus = await client.request('get', '/lol-store/v1/status');
        const shoppefrontStatus = await client.request(
            'get',
            '/lol-shoppefront/v1/ready',
        );

        console.log('store status:', storeStatus.storefrontIsRunning);
        console.log('shoppefront status:', shoppefrontStatus);

        // If stores are loaded, exit the loop
        if (
            storeStatus?.storefrontIsRunning == true &&
            shoppefrontStatus === true
        ) {
            storesLoaded = true;
            console.log('Stores are loaded and ready.');
            break;
        }
    } catch (error) {
        console.error('Error checking store status:', error);
    } finally {
        retries++;
        delay = Math.min(delay * 1.5, 30000);
    }
}

if (!storesLoaded) {
    console.error(
        'Stores did not load within the expected time. Exiting script.',
    );
    process.exit(21);
}

try {
    const mythicJSON = await client.request(
        'get',
        '/lol-shoppefront/v1/stores/MYTHIC_SHOP',
    );
    fs.writeFileSync(
        './data/source/mythicShop.json',
        JSON.stringify(mythicJSON, null, 4),
        'utf8',
    );
    console.log('Mythic shop data saved to mythicShop.json');
} catch (error) {
    console.error('Error fetching catalog data:', error);
}

try {
    const catalogJSON = await client.request('get', '/lol-store/v1/catalog');
    fs.writeFileSync(
        './data/source/catalog.json',
        JSON.stringify(catalogJSON, null, 4),
        'utf8',
    );
    console.log('Catalog data saved to catalog.json');
} catch (error) {
    console.error('Error saving catalog data:', error);
}

try {
    const sanctumJSON = await client.request('get', '/lol-sanctum/v1/banners');
    fs.writeFileSync(
        './data/source/sanctumBanners.json',
        JSON.stringify(sanctumJSON, null, 4),
        'utf8',
    );
    console.log('Sanctum banner data saved to sanctumBanners.json');
} catch (error) {
    console.error('Error fetching Sanctum banner data:', error);
}

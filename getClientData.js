import { HasagiClient } from '@hasagi/core';
import fs from 'fs';
import path from 'path';
import { parseLeagueLockfile } from './lib/leagueLockfile.js';

const client = new HasagiClient();
const leagueInstallDirectory =
    process.env.LEAGUE_INSTALL_DIRECTORY ?? 'C:\\Riot Games\\League of Legends';
const leagueLockfile = path.join(leagueInstallDirectory, 'lockfile');
const connectionAttempts = Number.parseInt(
    process.env.LEAGUE_CONNECTION_ATTEMPTS ?? '12',
    10,
);
const connectionAttemptDelay = Number.parseInt(
    process.env.LEAGUE_CONNECTION_DELAY_MS ?? '5000',
    10,
);

if (!Number.isInteger(connectionAttempts) || connectionAttempts < 1) {
    console.error('LEAGUE_CONNECTION_ATTEMPTS must be a positive integer.');
    process.exit(2);
}

if (!Number.isInteger(connectionAttemptDelay) || connectionAttemptDelay < 1) {
    console.error('LEAGUE_CONNECTION_DELAY_MS must be a positive integer.');
    process.exit(2);
}

let currentConnectionAttempt = 0;

let connectionError;

while (currentConnectionAttempt < connectionAttempts) {
    currentConnectionAttempt++;
    console.log(
        `Connecting to the League client with ${leagueLockfile}. Attempt ${currentConnectionAttempt} of ${connectionAttempts}.`,
    );

    try {
        const lockfileContent = await fs.promises.readFile(
            leagueLockfile,
            'utf8',
        );
        const credentials = parseLeagueLockfile(lockfileContent);

        await client.connect({
            authenticationStrategy: 'manual',
            credentials,
            useWebSocket: false,
        });
        connectionError = undefined;
        break;
    } catch (error) {
        connectionError = error;

        if (currentConnectionAttempt < connectionAttempts) {
            console.log(
                `League client is not ready yet. Retrying in ${connectionAttemptDelay} milliseconds.`,
            );
            await new Promise((resolve) =>
                setTimeout(resolve, connectionAttemptDelay),
            );
        }
    }
}

if (connectionError) {
    console.error(
        `Failed to connect to the League client after ${connectionAttempts} attempts. Exiting script.`,
        connectionError,
    );
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
        const shoppefrontStatus = true; // bugged, setting to true as default

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

try {
    const yourShopStatus = await client.request(
        'get',
        '/lol-yourshop/v1/status',
    );
    fs.writeFileSync(
        './data/source/yourShopStatus.json',
        JSON.stringify(yourShopStatus, null, 4),
        'utf8',
    );
    console.log('Your Shop status saved to yourShopStatus.json');
} catch (error) {
    fs.writeFileSync(
        './data/source/yourShopStatus.json',
        JSON.stringify({ fetchSucceeded: false }, null, 4),
        'utf8',
    );
    console.error('Error fetching Your Shop status:', error);
}

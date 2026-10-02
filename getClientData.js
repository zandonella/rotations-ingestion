import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectLcu } from './lib/lcuClient.js';
import { collectClientSnapshot, saveClientSnapshot } from './lib/clientSnapshot.js';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const directory = process.env.CLIENT_DATA_DIRECTORY || path.join(projectDirectory, 'data/source');
try {
    const client = await connectLcu();
    const snapshot = await collectClientSnapshot(client);
    saveClientSnapshot(snapshot, directory);
    console.log('Saved one complete clientSnapshot.json (catalog, Mythic Shop, Sanctum, Your Shop).');
} catch (error) {
    console.error(error.message);
    process.exitCode = 20;
}

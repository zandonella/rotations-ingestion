import fs from 'node:fs';
import { publishLinuxRunStatus } from '../lib/linuxRunStatus.js';

try {
    const status = JSON.parse(fs.readFileSync(new URL('../data/run/direct-status.json', import.meta.url), 'utf8'));
    await publishLinuxRunStatus(status);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

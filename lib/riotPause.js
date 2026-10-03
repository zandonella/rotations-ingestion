import fs from 'node:fs';
import path from 'node:path';
export class RiotPause extends Error {
    constructor(status, retryAfter, now = Date.now()) {
        super(`Collection paused after HTTP ${status}. ${status === 429 ? 'Waiting for rate-limit cooldown.' : 'Manual review/sign-in required before resuming.'}`);
        this.exitCode = 75;
        this.status = status;
        const seconds = /^\d+$/.test(retryAfter ?? '') ? Number(retryAfter) : NaN;
        const parsed = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retryAfter);
        this.resumeAt = status === 429 ? Math.max(now + 60000, Number.isFinite(parsed) ? parsed : now + 3600000) : null;
    }
}
export function checkRiotResponse(status, retryAfter) {
    if ([401, 403, 429].includes(status)) throw new RiotPause(status, retryAfter);
}
export function assertRiotNotPaused(file, now = Date.now()) {
    let state;
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (![401,403,429].includes(state.status) || (state.resumeAt !== null && !Number.isFinite(state.resumeAt))) {
        throw new Error('Invalid Riot pause file; manual review required.');
    }
    if (state.resumeAt === null || now < state.resumeAt) {
        const error = new RiotPause(state.status);
        error.resumeAt = state.resumeAt;
        throw error;
    }
}
export function saveRiotPause(file, error) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ status: error.status, resumeAt: error.resumeAt }), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
}

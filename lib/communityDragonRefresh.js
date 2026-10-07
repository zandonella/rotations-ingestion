import fs from 'node:fs';
import path from 'node:path';

export const COMMUNITY_DRAGON_UNAVAILABLE = 76;

// Only upstream download failures are tolerated. Local processing errors still fail.
export function refreshCommunityDragon(root, run, now = Date.now(), force = false) {
    const marker = path.join(root, 'data/run/production-static-date');
    const retryFile = path.join(root, 'data/run/communitydragon-retry.json');
    const today = new Date(now).toISOString().slice(0, 10);
    if (!force && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === today) return;
    if (!force && fs.existsSync(retryFile)) {
        const retry = JSON.parse(fs.readFileSync(retryFile, 'utf8'));
        if (now < retry.nextRetryAt) return retry.warning;
    }
    const result = run();
    if (result.status === COMMUNITY_DRAGON_UNAVAILABLE) {
        const warning = 'CommunityDragon unavailable; continuing sale collection with existing item metadata. Static refresh will retry within one hour.';
        fs.writeFileSync(retryFile, JSON.stringify({ nextRetryAt: now + 3_600_000, warning }), { mode: 0o600 });
        return warning;
    }
    if (result.error || result.status !== 0) throw result.error ?? new Error(`Static data processing failed (exit ${result.status}).`);
    fs.writeFileSync(marker, today, { mode: 0o600 });
    fs.rmSync(retryFile, { force: true });
}

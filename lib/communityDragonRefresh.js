import fs from 'node:fs';
import path from 'node:path';

export const COMMUNITY_DRAGON_UNAVAILABLE = 76;
const WARNING_PERIOD_MS = 30 * 60_000;
const ESCALATE_AFTER_MS = 6 * WARNING_PERIOD_MS;

export function communityDragonEscalated(root) {
    const file = path.join(root, 'data/run/communitydragon-retry.json');
    return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).escalated === true;
}

function recordWarning(file, previous, now) {
    const slot = Math.floor(now / WARNING_PERIOD_MS);
    const firstFailureAt = previous.firstFailureAt ?? (previous.nextRetryAt ? previous.nextRetryAt - 3_600_000 : now);
    const consecutiveWarnings = (previous.consecutiveWarnings ?? 0) + (previous.warningSlot === slot ? 0 : 1);
    const escalated = previous.escalated === true || (consecutiveWarnings >= 6 && now - firstFailureAt >= ESCALATE_AFTER_MS);
    const warning = `CommunityDragon unavailable; continuing sale collection with existing item metadata. ${consecutiveWarnings} consecutive warning runs; static refresh retries at most hourly.${escalated ? ' Outage has exceeded three hours; staff escalation remains active until recovery.' : ''}`;
    fs.writeFileSync(file, JSON.stringify({ ...previous, firstFailureAt, consecutiveWarnings, warningSlot: slot, escalated, warning }), { mode: 0o600 });
    return warning;
}

// Only upstream download failures are tolerated. Local processing errors still fail.
export function refreshCommunityDragon(root, run, now = Date.now(), force = false) {
    const marker = path.join(root, 'data/run/production-static-date');
    const retryFile = path.join(root, 'data/run/communitydragon-retry.json');
    const today = new Date(now).toISOString().slice(0, 10);
    if (!force && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === today) return;
    const retry = fs.existsSync(retryFile) ? JSON.parse(fs.readFileSync(retryFile, 'utf8')) : {};
    if (!force && now < retry.nextRetryAt) return recordWarning(retryFile, retry, now);
    const result = run();
    if (result.status === COMMUNITY_DRAGON_UNAVAILABLE) {
        return recordWarning(retryFile, { ...retry, nextRetryAt: now + 3_600_000 }, now);
    }
    if (result.error || result.status !== 0) throw result.error ?? new Error(`Static data processing failed (exit ${result.status}).`);
    fs.writeFileSync(marker, today, { mode: 0o600 });
    fs.rmSync(retryFile, { force: true });
}

// Wall-clock polling replaces sale-boundary wakes on the always-on Linux host.
export function nextPollAt(minutes, now = Date.now()) {
    const interval = Number(minutes);
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > 60 || 60 % interval !== 0) {
        throw new Error('INGESTION_POLL_INTERVAL_MINUTES must be a positive divisor of 60.');
    }
    const milliseconds = interval * 60_000;
    return new Date((Math.floor(now / milliseconds) + 1) * milliseconds);
}

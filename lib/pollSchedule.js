// Wall-clock polling with an explicit minute offset shared by timer and heartbeat.
export function nextPollAt(minutes, now = Date.now(), offsetMinutes = 0) {
    const interval = Number(minutes);
    const offset = Number(offsetMinutes);
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > 60 || 60 % interval !== 0) {
        throw new Error('INGESTION_POLL_INTERVAL_MINUTES must be a positive divisor of 60.');
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= interval) {
        throw new Error('INGESTION_POLL_OFFSET_MINUTES must be within the polling interval.');
    }
    const milliseconds = interval * 60_000;
    const anchor = offset * 60_000;
    return new Date((Math.floor((now - anchor) / milliseconds) + 1) * milliseconds + anchor);
}

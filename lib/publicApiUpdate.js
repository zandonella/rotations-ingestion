// Publish confirmed public state even when private refresh hints are disabled.
export async function refreshPublicApiWithClient(logger, db, hintsEnabled = true, requirePublication = false) {
    let changed;
    try {
        const { data, error } = await db.rpc('record_public_api_state');
        if (error || typeof data !== 'boolean') throw new Error('State publication failed.');
        changed = data;
    } catch {
        if (requirePublication) throw new Error('Failed to publish confirmed public API state.');
        logger.warn('Failed to publish confirmed public API state.');
        return false;
    }
    if ((!changed && !requirePublication) || !hintsEnabled) return false;
    const url = process.env.ROTATIONS_API_REFRESH_URL;
    const secret = process.env.ROTATIONS_API_REFRESH_SECRET;
    if (!url && !secret) return false;
    let warning;
    if (!url || !secret) {
        warning = 'Public API refresh hint skipped because configuration is incomplete.';
    } else {
        try {
            const response = await fetch(url, {
                method: 'POST', headers: { Authorization: `Bearer ${secret}` },
                signal: AbortSignal.timeout(5000), redirect: 'error',
            });
            await response.body?.cancel();
            if (response.status === 202) return true;
            warning = `Public API refresh hint failed with HTTP ${response.status}.`;
        } catch { warning = 'Public API refresh hint failed or timed out.'; }
    }
    console.warn(warning);
    logger.warn(warning);
    return false;
}

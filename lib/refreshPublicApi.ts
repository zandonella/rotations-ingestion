type WarningLogger = { warn(message: string): void };

// A cache hint is optional and must never turn successful ingestion into failure.
export async function refreshPublicApi(logger: WarningLogger): Promise<boolean> {
    const url = process.env.ROTATIONS_API_REFRESH_URL;
    const secret = process.env.ROTATIONS_API_REFRESH_SECRET;
    if (!url && !secret) return false;

    let warning: string;
    if (!url || !secret) {
        warning = 'Public API refresh hint skipped because configuration is incomplete.';
    } else {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${secret}` },
                signal: AbortSignal.timeout(5000),
                redirect: 'error',
            });
            await response.body?.cancel();
            if (response.status === 202) return true;
            warning = `Public API refresh hint failed with HTTP ${response.status}.`;
        } catch {
            // Fetch errors can contain the URL. Keep routing and credentials private.
            warning = 'Public API refresh hint failed or timed out.';
        }
    }

    console.warn(warning);
    logger.warn(warning);
    return false;
}

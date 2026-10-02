// These tokens belong to an existing signed-in League session. This code never
// requests passwords, refreshes a session, or attempts to defeat login challenges.
export function assertRiotStoreUrl(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error('Session has an invalid store URL.'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.riotgames.com') ||
        !/^(store|[a-z0-9-]+-store|plstore\d*)\./.test(url.hostname) ||
        url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') {
        throw new Error('Session store URL is not an HTTPS Riot store origin.');
    }
    return url.origin;
}

export function tokenExpiry(accessToken) {
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
        return Number.isFinite(payload.exp) ? new Date(payload.exp * 1000).toISOString() : null;
    } catch { return null; }
}

export function validateRiotSession(session, now = Date.now()) {
    assertRiotStoreUrl(session?.storeUrl);
    if (session.schemaVersion !== 1 || typeof session.accessToken !== 'string' || !session.accessToken ||
        /\s/.test(session.accessToken)) throw new Error('Session has no usable access token.');
    // JWT decoding is only a freshness check. Riot validates the actual signature.
    const expiry = tokenExpiry(session.accessToken);
    if (expiry && Date.parse(expiry) <= now + 30_000) throw new Error('Riot access token has expired or is about to expire. Export a fresh signed-in session.');
    return session;
}

export async function probeStore(session, { fetchImpl = fetch } = {}) {
    validateRiotSession(session);
    const origin = assertRiotStoreUrl(session.storeUrl);
    const language = /^[a-z]{2}_[A-Z]{2}$/.test(session.locale) ? session.locale : 'en_US';
    // These GET paths are used by the shipped rcp-fe-lol-store frontend.
    // Responses are research artifacts, not automatically treated as LCU catalog data.
    const results = [];
    for (const page of ['skins', 'champions']) {
        const url = `${origin}/storefront/v3/view/${page}?language=${language}`;
        let response;
        try {
            response = await fetchImpl(url, {
                method: 'GET', headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
                signal: AbortSignal.timeout(15_000), redirect: 'error',
            });
        } catch { throw new Error('Direct Riot request failed or timed out. No session details were logged.'); }
        if ([401, 403].includes(response.status)) {
            await response.body?.cancel();
            throw new Error(`Riot refused the session with HTTP ${response.status}. Obtain a fresh authorized session; no automatic login attempts were made.`);
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Direct Riot store returned HTTP ${response.status}. The route may have changed.`);
        }
        let data;
        try { data = await response.json(); } catch { throw new Error('Direct Riot store response is not JSON.'); }
        results.push({ page, data });
    }
    return results;
}

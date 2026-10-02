// Opt-in guard for the Linux lab. Never permits a remote Supabase destination.
export function isLocalMode(env = process.env) {
    return env.INGESTION_LOCAL_ONLY === 'true';
}

export function assertLocalSupabase(env = process.env) {
    if (!isLocalMode(env)) return;
    let url;
    try { url = new URL(env.SUPABASE_URL); } catch {
        throw new Error('Local mode requires a loopback SUPABASE_URL.');
    }
    if (!['127.0.0.1', '[::1]'].includes(url.hostname) ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('Local mode refuses a non-loopback Supabase destination.');
    }
}

export function localSupabaseFetch(input, init = {}) {
    assertLocalSupabase();
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== new URL(process.env.SUPABASE_URL).origin) {
        throw new Error('Local mode refuses a request outside local Supabase.');
    }
    return fetch(input, { ...init, redirect: 'error' });
}

export function productionEnvironment(config) {
    const url = new URL(config.SUPABASE_URL);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/' || !config.SUPABASE_KEY ||
        !config.RIOT_CLIENT_LOCKFILE?.startsWith('/')) {
        throw new Error('Production requires an HTTPS Supabase origin, service-role key, and absolute Riot lockfile path.');
    }
    return {
        ...config, INGESTION_LOCAL_ONLY: 'false', CLIENT_REQUIRE_SNAPSHOT: 'true',
        INGESTION_POLL_INTERVAL_MINUTES: '30', WAKE_SCHEDULER_ENABLED: 'false',
        WOL_API_IP: '', WAKE_SCHEDULER_URL: '', DISCORD_SUCCESS_ENABLED: 'false',
        DISCORD_WEBHOOK_URL: config.DISCORD_WEBHOOK_URL || '',
        DISCORD_MENTION_ROLE_ID: config.DISCORD_MENTION_ROLE_ID || '',
        ROTATIONS_API_REFRESH_URL: config.ROTATIONS_API_REFRESH_URL || '',
        ROTATIONS_API_REFRESH_SECRET: config.ROTATIONS_API_REFRESH_SECRET || '',
    };
}

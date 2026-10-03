import { assertLocalSupabase } from './localMode.js';

const terminal = new Set(['ok', 'error', 'interrupted']);

export function buildLinuxRunRecord(status) {
    if (!status || !['running', ...terminal].includes(status.status) ||
        !Number.isSafeInteger(status.attempt) || status.attempt < 1 || status.attempt > 3 ||
        typeof status.updatedAt !== 'string' || !Number.isFinite(Date.parse(status.updatedAt)) ||
        (status.lastResult != null && !terminal.has(status.lastResult))) {
        throw new Error('Invalid Linux runner status; refusing to publish it.');
    }
    return {
        runner_id: 'direct', status: status.status, attempt: status.attempt,
        updated_at: status.updatedAt, last_result: status.lastResult ?? null,
    };
}

export async function publishLinuxRunStatus(status, { env = process.env, fetchImpl = fetch } = {}) {
    assertLocalSupabase(env);
    const row = buildLinuxRunRecord(status);
    const origin = new URL(env.SUPABASE_URL);
    if (!env.SUPABASE_KEY || !['http:', 'https:'].includes(origin.protocol) ||
        origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
        throw new Error('Invalid Linux reporting database configuration.');
    }
    let response;
    try {
        response = await fetchImpl(`${origin.origin}/rest/v1/linux_ingestion_status?on_conflict=runner_id`, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
            headers: {
                apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`,
                'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(row),
        });
    } catch { throw new Error('Linux run-status reporting failed or timed out.'); }
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Linux run-status reporting returned HTTP ${response.status}.`);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscordLogger as LegacyLogger } from '../lib/discordLogger.ts';
import { DiscordLogger as LinuxLogger } from '../lib/discordLoggerLinux.ts';
const loggers = [LegacyLogger, LinuxLogger];

test('no-op completions stay quiet; only errors mention the configured role', async t => {
    const keys = ['DISCORD_WEBHOOK_URL', 'DISCORD_MENTION_ROLE_ID', 'DISCORD_SUCCESS_ENABLED', 'INGESTION_LOCAL_ONLY'];
    const previous = { ...process.env };
    Object.assign(process.env, {
        DISCORD_WEBHOOK_URL: 'https://discord.invalid/test',
        DISCORD_MENTION_ROLE_ID: ' 123 ',
        DISCORD_SUCCESS_ENABLED: 'true',
        INGESTION_LOCAL_ONLY: 'false',
    });
    t.after(() => {
        for (const key of keys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
    const payloads: any[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
        payloads.push(JSON.parse(options.body));
        return new Response(null, { status: 204 });
    });
    for (const Logger of loggers) {
        await new Logger('no-op').finish();
        assert.equal(payloads.length, 0);
    }
    for (const Logger of loggers) {
        for (const level of ['warn', 'error'] as const) {
            const logger = new Logger('issues');
            logger[level]('Something needs attention.');
            await logger.finish();
            const payload = payloads.pop();
            assert.equal(payload.content, level === 'error' ? '<@&123>' : undefined);
            assert.deepEqual(payload.allowed_mentions, level === 'error' ? { parse: [], roles: ['123'] } : { parse: [] });
            assert.match(payload.embeds[0].title, new RegExp(`^${level.toUpperCase()}:`));
        }
    }
});

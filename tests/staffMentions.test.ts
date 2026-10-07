import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscordLogger as LinuxLogger } from '../lib/discordLoggerLinux.ts';
import { DiscordLogger as LegacyLogger } from '../lib/discordLogger.ts';

test('only errors mention staff in both ingestion loggers', async t => {
    const keys = ['DISCORD_WEBHOOK_URL', 'DISCORD_MENTION_ROLE_ID', 'INGESTION_LOCAL_ONLY'];
    const previous = { ...process.env };
    Object.assign(process.env, { DISCORD_WEBHOOK_URL: 'https://discord.invalid/test', DISCORD_MENTION_ROLE_ID: '123', INGESTION_LOCAL_ONLY: 'false' });
    t.after(() => { for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    } });
    const payloads: any[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: any, options: any) => {
        payloads.push(JSON.parse(options.body));
        return new Response(null, { status: 204 });
    });
    for (const Logger of [LinuxLogger, LegacyLogger]) {
        const warning = new Logger('test'); warning.warn('CommunityDragon unavailable'); await warning.finish();
        const warnPayload = payloads.at(-1);
        assert.equal(warnPayload.content, undefined);
        assert.deepEqual(warnPayload.allowed_mentions, { parse: [] });
        const error = new Logger('test'); error.error('Action required'); await error.finish();
        assert.equal(payloads.at(-1).content, '<@&123>');
        assert.deepEqual(payloads.at(-1).allowed_mentions, { parse: [], roles: ['123'] });
    }
});

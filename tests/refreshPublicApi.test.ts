import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshPublicApiWithClient } from '../lib/publicApiUpdate.js';

test('confirmed state always publishes and only actual changes send optional bounded hints', async t => {
    const originalUrl = process.env.ROTATIONS_API_REFRESH_URL;
    const originalSecret = process.env.ROTATIONS_API_REFRESH_SECRET;
    t.after(() => {
        if (originalUrl === undefined) delete process.env.ROTATIONS_API_REFRESH_URL;
        else process.env.ROTATIONS_API_REFRESH_URL = originalUrl;
        if (originalSecret === undefined) delete process.env.ROTATIONS_API_REFRESH_SECRET;
        else process.env.ROTATIONS_API_REFRESH_SECRET = originalSecret;
    });
    let changed = true;
    const db = { async rpc(name: string) { assert.equal(name, 'record_public_api_state'); return { data: changed, error: null }; } };
    const refreshPublicApi = (logger: { warn(message: string): void }) => refreshPublicApiWithClient(logger, db);
    const warnings: string[] = [];
    const logger = { warn: (message: string) => { warnings.push(message); } };
    t.mock.method(console, 'warn', () => {});
    delete process.env.ROTATIONS_API_REFRESH_URL;
    delete process.env.ROTATIONS_API_REFRESH_SECRET;
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 202 }));
    assert.equal(await refreshPublicApi(logger), false);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(warnings.length, 0);

    process.env.ROTATIONS_API_REFRESH_URL = 'https://private-routing.invalid/internal/refresh';
    assert.equal(await refreshPublicApi(logger), false);
    assert.equal(fetchMock.mock.callCount(), 0);
    process.env.ROTATIONS_API_REFRESH_SECRET = 'test-refresh-secret';
    assert.equal(await refreshPublicApi(logger), true);
    changed = false;
    assert.equal(await refreshPublicApi(logger), false);
    assert.equal(fetchMock.mock.callCount(), 1);
    changed = true;
    const [url, options] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, process.env.ROTATIONS_API_REFRESH_URL);
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { Authorization: 'Bearer test-refresh-secret' });
    assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);

    fetchMock.mock.mockImplementation(async () => new Response('secret response', { status: 503 }));
    assert.equal(await refreshPublicApi(logger), false);
    fetchMock.mock.mockImplementation(async () => { throw new Error('test-refresh-secret private-routing'); });
    assert.equal(await refreshPublicApi(logger), false);
    t.mock.method(AbortSignal, 'timeout', (duration: number) => {
        assert.equal(duration, 5000);
        return AbortSignal.abort();
    });
    fetchMock.mock.mockImplementation(async (_url: unknown, options: RequestInit) => {
        options.signal!.throwIfAborted();
        return new Response(null, { status: 202 });
    });
    assert.equal(await refreshPublicApi(logger), false);
    assert.equal(warnings.length, 4);
    assert.doesNotMatch(warnings.join('\n'), /test-refresh-secret|private-routing|secret response/);
    const calls = fetchMock.mock.callCount();
    assert.equal(await refreshPublicApiWithClient(logger, db, false), false);
    assert.equal(fetchMock.mock.callCount(), calls, 'Local publication must not send a hint.');
    assert.equal(await refreshPublicApiWithClient(logger, {
        async rpc() { return { data: null, error: { message: 'private-routing test-refresh-secret' } }; },
    }), false);
    assert.equal(fetchMock.mock.callCount(), calls);
    assert.equal(warnings.length, 5);
    assert.doesNotMatch(warnings.join('\n'), /test-refresh-secret|private-routing/);
});

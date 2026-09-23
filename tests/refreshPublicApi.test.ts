import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshPublicApi } from '../lib/refreshPublicApi.ts';

test('refresh hints are optional, bodyless, bounded, and warning-only', async t => {
    const originalUrl = process.env.ROTATIONS_API_REFRESH_URL;
    const originalSecret = process.env.ROTATIONS_API_REFRESH_SECRET;
    t.after(() => {
        if (originalUrl === undefined) delete process.env.ROTATIONS_API_REFRESH_URL;
        else process.env.ROTATIONS_API_REFRESH_URL = originalUrl;
        if (originalSecret === undefined) delete process.env.ROTATIONS_API_REFRESH_SECRET;
        else process.env.ROTATIONS_API_REFRESH_SECRET = originalSecret;
    });
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
});

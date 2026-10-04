import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import manifest from '../examples/hello-kns/module.json' with { type: 'json' };
import { SERVICE_TOKEN_NAME, loadConfig } from '../examples/hello-kns/api/config.ts';
import { createHelloServer } from '../examples/hello-kns/api/server.ts';
import { SESSION_COOKIE, startFakeCore, syntheticActor } from './support/fake-core.ts';

const SERVICE_TOKEN = 'synthetic-service-token-for-tests-only';
const api = manifest.module.apiBasePath;

async function withServer(
  decide: Parameters<typeof startFakeCore>[0],
  body: (base: string, core: Awaited<ReturnType<typeof startFakeCore>>) => Promise<void>,
) {
  const core = await startFakeCore(decide);
  const server = createHelloServer({ identityUrl: core.url, serviceToken: SERVICE_TOKEN });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await body(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, core);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await core.close();
  }
}
const ok = () => ({ status: 200, body: { data: syntheticActor } });

test('health and version report the packaged release version without calling Core', async () => {
  await withServer(ok, async (base, core) => {
    const health = await fetch(`${base}${api}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { data: { status: 'ok', version: manifest.module.version } });
    const version = await fetch(`${base}${api}/version`);
    assert.deepEqual(await version.json(), { data: { version: manifest.module.version } });
    assert.equal(core.calls.length, 0);
  });
});

test('greeting needs a KNS session and is authorised by Core with the module credential', async () => {
  await withServer(ok, async (base, core) => {
    const anonymous = await fetch(`${base}${api}`);
    assert.equal(anonymous.status, 401);
    assert.equal(core.calls.length, 0);

    const response = await fetch(`${base}${api}`, { headers: { cookie: SESSION_COOKIE } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { message: 'Hello, Synthetic Teacher.' } });
    assert.equal(core.calls.length, 1);
    assert.equal(core.calls[0].authorization, `Bearer ${SERVICE_TOKEN}`);
    assert.equal(core.calls[0].body.permission, 'hello.read');
    assert.equal(core.calls[0].body.mutation, false);
    assert.equal(core.calls[0].body.sessionToken, 'a'.repeat(43));
  });
});

test('Core denial, Core outage and unknown routes use the KNS error envelope', async () => {
  await withServer(
    () => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'Permission denied' } } }),
    async (base) => {
      const denied = await fetch(`${base}${api}`, { headers: { cookie: SESSION_COOKIE } });
      assert.equal(denied.status, 403);
      const body = (await denied.json()) as any;
      assert.equal(body.error.code, 'FORBIDDEN');
      assert.match(body.error.requestId, /^[A-Za-z0-9._-]{8,80}$/);
      assert.equal(denied.headers.get('x-request-id'), body.error.requestId);
      assert.equal((await fetch(`${base}${api}/nope`)).status, 404);
      assert.equal((await fetch(`${base}${api}`, { method: 'POST' })).status, 405);
    },
  );
  const unreachable = createHelloServer({ identityUrl: 'http://127.0.0.1:1', serviceToken: SERVICE_TOKEN });
  await new Promise<void>((resolve) => unreachable.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${(unreachable.address() as AddressInfo).port}`;
    const down = await fetch(`${base}${api}`, { headers: { cookie: SESSION_COOKIE } });
    assert.equal(down.status, 503);
    const text = await down.text();
    assert.match(text, /DEPENDENCY_UNAVAILABLE/);
    assert.ok(!text.includes(SERVICE_TOKEN), 'the service credential must never be returned');
  } finally {
    await new Promise<void>((resolve) => unreachable.close(() => resolve()));
  }
});

test('runtime configuration follows the KNS injection contract', () => {
  assert.equal(SERVICE_TOKEN_NAME, 'HELLO_SERVICE_TOKEN');
  const base = {
    IDENTITY_URL: 'http://core-identity:4104/',
    HELLO_SERVICE_TOKEN: SERVICE_TOKEN,
    PORT: '8080',
    HOST: '0.0.0.0',
  };
  assert.deepEqual(loadConfig(base), {
    identityUrl: 'http://core-identity:4104',
    serviceToken: SERVICE_TOKEN,
    host: '0.0.0.0',
    port: 8080,
  });
  // The generic names are not part of the contract and must not be accepted.
  assert.throws(
    () => loadConfig({ IDENTITY_URL: base.IDENTITY_URL, SERVICE_TOKEN }),
    /HELLO_SERVICE_TOKEN is required/,
  );
  assert.throws(() => loadConfig({ HELLO_SERVICE_TOKEN: SERVICE_TOKEN }), /IDENTITY_URL is required/);
  assert.throws(() => loadConfig({ ...base, IDENTITY_URL: 'file:///etc/passwd' }), /http\(s\)/);
  assert.throws(() => loadConfig({ ...base, PORT: '0' }), /PORT/);
});

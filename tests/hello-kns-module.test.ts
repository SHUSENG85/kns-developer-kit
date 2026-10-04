import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Value } from '@sinclair/typebox/value';
import { KnsmodModuleSchema } from '@kns/contracts/knsmod';

const example = new URL('../examples/hello-kns/', import.meta.url);
const read = (path: string) => readFile(new URL(path, example), 'utf8');

test('module.json satisfies the executable KNS module contract', async () => {
  const module = JSON.parse(await read('module.json'));
  assert.deepEqual([...Value.Errors(KnsmodModuleSchema, module)], []);
  assert.deepEqual(Object.keys(module.artifacts.apiImage).sort(), ['manifestDigest', 'path']);
  assert.equal(module.shape, 'B');
  assert.equal(module.module.requiredPlatformContract, '2');
});

test('hello owns no canonical data and declares no database', async () => {
  const module = JSON.parse(await read('module.json'));
  assert.deepEqual(module.module.ownedSchemas, []);
  assert.deepEqual(module.artifacts.migrations, []);
  assert.equal(module.artifacts.databaseAccess, undefined);
  assert.deepEqual(module.module.permissions, ['hello.read']);
  assert.deepEqual(module.requiredSecrets, []);
});

test('OpenAPI paths stay inside the module API base path', async () => {
  const module = JSON.parse(await read('module.json'));
  const openapi = JSON.parse(await read('contracts/openapi.json'));
  for (const path of Object.keys(openapi.paths))
    assert.ok(path === module.module.apiBasePath || path.startsWith(`${module.module.apiBasePath}/`), path);
});

test('API image is non-root, digest-pinned and carries no credentials', async () => {
  const dockerfile = await read('api/Dockerfile');
  assert.match(dockerfile, /^FROM node:24-[a-z0-9.-]+@sha256:[a-f0-9]{64}$/m);
  const user = /^USER\s+(\S+)/m.exec(dockerfile)?.[1] ?? '';
  assert.ok(user && !/^(0|root)(:.*)?$/.test(user), 'image must set a non-root USER');
  assert.doesNotMatch(dockerfile, /TOKEN|PASSWORD|SECRET|PRIVATE KEY/i);
});

test('the example uses only public developer-kit surfaces and the injected variable names', async () => {
  const files = ['api/app.ts', 'api/server.ts', 'api/config.ts', 'api/main.ts', 'frontend/App.tsx', 'frontend/main.tsx'];
  const sources = (await Promise.all(files.map(read))).join('\n');
  assert.doesNotMatch(sources, /@kns\/(?!contracts)/);
  assert.doesNotMatch(sources, /packages\/|apps\//);
  assert.doesNotMatch(sources, /process\.env\.SERVICE_TOKEN|process\.env\.IDENTITY_URL!/);
  assert.match(await read('api/config.ts'), /_SERVICE_TOKEN/);
});

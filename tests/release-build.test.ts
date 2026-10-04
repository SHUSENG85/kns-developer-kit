import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  allowedMember,
  generatePublisherKey,
  loadSqlParser,
  packModule,
  sensitiveFindings,
  validatePackage,
} from '@kns/module-toolchain';
import {
  buildFrontend,
  bundleApi,
  checkApiImage,
  parseModuleJson,
  releaseEvidence,
  releaseModuleJson,
} from '../tooling/release.ts';
import { SESSION_COOKIE, startFakeCore, syntheticActor } from './support/fake-core.ts';
import { buildOciArchive, helloLabels } from './support/oci-fixture.ts';

const kit = new URL('../', import.meta.url);
const example = new URL('examples/hello-kns/', kit);
const path = (url: URL) => decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const COMMIT = '1234567890abcdef1234567890abcdef12345678';
const identity = { moduleId: 'hello', version: '0.1.0', sourceCommit: COMMIT };
await loadSqlParser();

const scratch = await mkdtemp(join(tmpdir(), 'kns-kit-test-'));
test.after(() => rm(scratch, { recursive: true, force: true }));
let counter = 0;
const fresh = async (name: string) => {
  const dir = join(scratch, `${name}-${++counter}`);
  await mkdir(dir, { recursive: true });
  return dir;
};

const template = parseModuleJson(await readFile(new URL('module.json', example), 'utf8'));

/** Assemble a complete release directory the way `example:build` does, with a fixture image. */
async function release(image = buildOciArchive({ labels: helloLabels() }), declaredDigest = image.manifestDigest) {
  const dir = await fresh('release');
  await buildFrontend({
    entry: path(new URL('frontend/main.tsx', example)),
    indexTemplate: path(new URL('frontend/index.html', example)),
    outDir: join(dir, 'frontend'),
    basePath: template.module.frontendBasePath,
    identity,
  });
  await mkdir(join(dir, 'api'), { recursive: true });
  await writeFile(join(dir, 'api', 'image.oci.tar'), image.archive);
  await mkdir(join(dir, 'contracts'), { recursive: true });
  await writeFile(join(dir, 'contracts', 'openapi.json'), await readFile(new URL('contracts/openapi.json', example)));
  await writeFile(
    join(dir, 'module.json'),
    JSON.stringify(releaseModuleJson(template, { sourceCommit: COMMIT, manifestDigest: declaredDigest }), null, 2),
  );
  await mkdir(join(dir, 'verification'), { recursive: true });
  await writeFile(
    join(dir, 'verification', 'release-evidence.json'),
    JSON.stringify(releaseEvidence(identity, 'node test', [{ command: 'fixture', result: 'PASS' }])),
  );
  return dir;
}
async function sign(releaseDir: string) {
  const keyDir = await fresh('keys');
  const key = generatePublisherKey();
  const keyPath = join(keyDir, 'proof-key.private.pem');
  await writeFile(keyPath, key.privateKeyPem, { mode: 0o600 });
  const trust = { keys: [{ keyId: 'proof-key', publicKey: key.publicKey, modules: ['hello'], revoked: false }] };
  const out = await fresh('package');
  const packed = await packModule({ input: releaseDir, outputDir: out, privateKeyPem: key.privateKeyPem, privateKeyPath: keyPath, keyId: 'proof-key' });
  return { keyPath, trust, packed };
}

test('release module.json carries the real digest and commit and stays schema-valid', () => {
  const { archive, manifestDigest } = buildOciArchive({ labels: helloLabels() });
  assert.ok(archive.length > 0);
  const finished = releaseModuleJson(template, { sourceCommit: COMMIT, manifestDigest });
  assert.equal(finished.artifacts.apiImage?.manifestDigest, manifestDigest);
  assert.equal(finished.source.commit, COMMIT);
  assert.notEqual(finished.artifacts.apiImage?.manifestDigest, template.artifacts.apiImage?.manifestDigest);
  assert.deepEqual(finished.module.ownedSchemas, []);
  assert.throws(() => releaseModuleJson(template, { sourceCommit: 'abc', manifestDigest }), /module contract/);
  assert.throws(() => parseModuleJson('{"artifacts":{"apiImage":{"digest":"sha256:0"}}}'), /module contract/);
});

test('image acceptance: linux/amd64, non-root, identity labels', () => {
  const good = buildOciArchive({ labels: helloLabels() });
  assert.equal(checkApiImage(good.archive, identity).manifestDigest, good.manifestDigest);
  const reject = (options: Parameters<typeof buildOciArchive>[0], expected: RegExp) =>
    assert.throws(() => checkApiImage(buildOciArchive(options).archive, identity), expected);
  reject({ labels: helloLabels(), user: 'root' }, /non-root/);
  reject({ labels: helloLabels(), user: '0:0' }, /non-root/);
  reject({ labels: helloLabels(), user: '' }, /non-root/);
  reject({ labels: helloLabels(), architecture: 'arm64' }, /linux\/amd64/);
  reject({ labels: helloLabels('9.9.9') }, /image.version/);
  reject({ labels: { 'org.opencontainers.image.version': '0.1.0' } }, /org.kns.module.id/);
});

test('frontend build is a static, hashed, source-map-free artifact the package policy accepts', async () => {
  const dir = await fresh('frontend');
  const built = await buildFrontend({
    entry: path(new URL('frontend/main.tsx', example)),
    indexTemplate: path(new URL('frontend/index.html', example)),
    outDir: dir,
    basePath: '/hello/',
    identity,
  });
  const html = await readFile(join(dir, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`/hello/assets/${built.script}`));
  assert.match(html, /<div id="root">/);
  assert.ok(built.style, 'the UI kit stylesheet is bundled');
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'build-info.json'), 'utf8')), {
    moduleId: 'hello',
    version: '0.1.0',
    sourceCommit: COMMIT,
  });
  const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  assert.ok(files.length >= 4);
  for (const file of files) {
    const member = `frontend/${join(file.parentPath, file.name).slice(dir.length + 1).replaceAll('\\', '/')}`;
    assert.ok(allowedMember(member), `${member} is an allowed package member`);
    assert.ok(!member.endsWith('.map'), 'no source maps');
    assert.deepEqual(sensitiveFindings(member, await readFile(join(file.parentPath, file.name))), []);
  }
});

test('the bundled API runs on the injected environment alone', async () => {
  const dir = await fresh('api');
  const bundle = join(dir, 'server.mjs');
  await bundleApi({ entry: path(new URL('api/main.ts', example)), outFile: bundle });
  const core = await startFakeCore(() => ({ status: 200, body: { data: syntheticActor } }));
  const port = await new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
  const child = spawn(process.execPath, [bundle], {
    // Only the documented injection contract: no inherited secrets, no generic SERVICE_TOKEN.
    env: { PORT: String(port), HOST: '127.0.0.1', IDENTITY_URL: core.url, HELLO_SERVICE_TOKEN: 'synthetic-token-for-bundle-test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('exit', (code) => reject(new Error(`bundle exited early (${code})`)));
      child.stdout.on('data', (d) => /listening/.test(String(d)) && resolve());
    });
    const health = await fetch(`http://127.0.0.1:${port}/api/v1/hello/health`);
    assert.deepEqual(await health.json(), { data: { status: 'ok', version: '0.1.0' } });
    const greeting = await fetch(`http://127.0.0.1:${port}/api/v1/hello`, { headers: { cookie: SESSION_COOKIE } });
    assert.deepEqual(await greeting.json(), { data: { message: 'Hello, Synthetic Teacher.' } });
    assert.equal(core.calls[0].authorization, 'Bearer synthetic-token-for-bundle-test');
  } finally {
    child.removeAllListeners('exit');
    child.kill();
    await core.close();
  }
});

test('a complete release packs and verifies offline as PACKAGE_VERIFIED', async () => {
  const dir = await release();
  const { trust, packed } = await sign(dir);
  assert.equal(packed.report.status, 'PACKAGE_VERIFIED');
  assert.match(packed.file, /kns-hello-0\.1\.0\.knsmod$/);
  const report = validatePackage(await readFile(packed.file), { trustStore: trust, filename: 'kns-hello-0.1.0.knsmod' });
  assert.equal(report.status, 'PACKAGE_VERIFIED');
  assert.equal(report.moduleId, 'hello');
  assert.equal(report.packageSha256, packed.sha256);
  // An unrelated trust store (different key) must not verify the package.
  const other = { keys: [{ ...trust.keys[0], keyId: 'proof-key', publicKey: generatePublisherKey().publicKey }] };
  assert.notEqual(validatePackage(await readFile(packed.file), { trustStore: other, filename: 'kns-hello-0.1.0.knsmod' }).status, 'PACKAGE_VERIFIED');
});

test('the validator, not the harness, rejects a wrong digest, root image or label drift', async () => {
  for (const [name, image, digest, pattern] of [
    ['digest', buildOciArchive({ labels: helloLabels() }), `sha256:${'1'.repeat(64)}`, /manifest digest differs/],
    ['root', buildOciArchive({ labels: helloLabels(), user: 'root' }), undefined, /non-root/],
    ['labels', buildOciArchive({ labels: helloLabels('0.0.1') }), undefined, /OCI labels/],
  ] as const) {
    const dir = await release(image, digest);
    const key = generatePublisherKey();
    await assert.rejects(
      packModule({ input: dir, outputDir: await fresh('package'), privateKeyPem: key.privateKeyPem, keyId: 'proof-key' }),
      pattern,
      name,
    );
  }
});

test('packing refuses secrets in the release and a signing key inside it', async () => {
  const leaky = await release();
  await writeFile(join(leaky, 'frontend', 'notes.txt'), `-----BEGIN PRIVATE ${'KEY'}-----\nsynthetic\n`);
  const key = generatePublisherKey();
  await assert.rejects(
    packModule({ input: leaky, outputDir: await fresh('package'), privateKeyPem: key.privateKeyPem, keyId: 'proof-key' }),
    /private key material/,
  );
  const inside = await release();
  const keyPath = join(inside, 'proof-key.private.pem');
  await writeFile(keyPath, key.privateKeyPem);
  await assert.rejects(
    packModule({ input: inside, outputDir: await fresh('package'), privateKeyPem: key.privateKeyPem, privateKeyPath: keyPath, keyId: 'proof-key' }),
    /signing key must not be inside/,
  );
});

test('the public CLI runs keygen, pack and verify and ends with PACKAGE_VERIFIED', async () => {
  const dir = await release();
  const keys = await fresh('cli-keys');
  const out = join(await fresh('cli-package'), 'not', 'yet', 'created'); // pack creates the output directory
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', path(new URL('tooling/kns.ts', kit)), ...args], {
      cwd: path(kit),
      encoding: 'utf8',
    });
  const keygen = cli('keygen', 'proof-key', keys, '--module', 'hello');
  assert.equal(keygen.status, 0, keygen.stderr);
  assert.ok(!keygen.stdout.includes('BEGIN'), 'keygen never prints the private key');
  const trust = join(keys, 'proof-key.trust-store.json');
  assert.deepEqual(JSON.parse(await readFile(trust, 'utf8')).keys[0].modules, ['hello']);
  const pack = cli('pack', dir, '--key', join(keys, 'proof-key.private.pem'), '--key-id', 'proof-key', '--out', out);
  assert.equal(pack.status, 0, pack.stderr);
  assert.match(pack.stdout, /kns-hello-0\.1\.0\.knsmod\nSHA-256 [a-f0-9]{64}\nPACKAGE_VERIFIED/);
  const verify = cli('verify', join(out, 'kns-hello-0.1.0.knsmod'), '--trust', trust);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  assert.match(verify.stdout.split('\n')[0], /^PACKAGE_VERIFIED {2}hello@0\.1\.0 {2}sha256 [a-f0-9]{64}$/);
});

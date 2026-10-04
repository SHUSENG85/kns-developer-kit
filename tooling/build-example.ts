#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  bundleApi,
  buildFrontend,
  checkApiImage,
  parseModuleJson,
  place,
  releaseEvidence,
  releaseModuleJson,
} from './release.ts';

// `npm run example:build [-- --out <dir>] [--source-commit <sha>] [--allow-dirty]`
// Builds the hello-kns reference module into a release directory ready for `kns pack`:
//   <out>/release/   packer input: module.json, frontend/, api/image.oci.tar, contracts/, verification/
//   <out>/work/      intermediate API bundle and image build context (never packaged)
// Requires Docker with a buildx builder that supports the OCI exporter (Docker with the containerd
// image store, or `docker buildx create --use --driver docker-container`). Nothing is signed here.
const exec = promisify(execFile);
const kitRoot = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (message: string): never => {
  console.error(`example:build failed: ${message}`);
  process.exit(1);
};
const MARKER = '.kns-example-build';
type Command = { command: string; result: 'PASS' | 'FAIL'; summary?: string };
const commands: Command[] = [];

async function run(file: string, fileArgs: string[], cwd = kitRoot) {
  return new Promise<{ code: number; output: string }>((resolveRun) => {
    const child = spawn(file, fileArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('error', (error) => resolveRun({ code: 127, output: String(error) }));
    child.on('close', (code) => resolveRun({ code: code ?? 1, output: Buffer.concat(chunks).toString('utf8') }));
  });
}
async function git(...gitArgs: string[]) {
  try {
    return (await exec('git', gitArgs, { cwd: kitRoot })).stdout.trim();
  } catch {
    return null;
  }
}

async function sourceIdentity() {
  const explicit = flag('source-commit') ?? process.env.KNS_SOURCE_COMMIT;
  const head = await git('rev-parse', 'HEAD');
  const commit = explicit ?? head;
  if (!commit || !/^[a-f0-9]{40}$/.test(commit))
    fail('no source commit: run inside a git checkout or pass --source-commit <40-hex sha>');
  const dirty = head && (await git('status', '--porcelain'));
  if (dirty && !args.includes('--allow-dirty'))
    fail('the working tree has uncommitted changes; commit them or pass --allow-dirty (recorded as-is)');
  const epoch = Number(await git('show', '-s', '--format=%ct', commit!)) || 0;
  return { sourceCommit: commit!, epoch };
}

async function verificationStep(label: string, command: string, file: string, fileArgs: string[], summarize?: (out: string) => string) {
  console.log(`> ${command}`);
  const { code, output } = await run(file, fileArgs);
  const summary = summarize?.(output);
  commands.push({ command, result: code === 0 ? 'PASS' : 'FAIL', ...(summary ? { summary } : {}) });
  if (code !== 0) {
    console.error(output.slice(-4000));
    fail(`${label} failed`);
  }
}

const require = createRequire(import.meta.url);
const outRoot = resolve(kitRoot, flag('out') ?? 'build/hello-kns');
const releaseDir = join(outRoot, 'release');
const workDir = join(outRoot, 'work');
const example = join(kitRoot, 'examples', 'hello-kns');

const template = parseModuleJson(await readFile(join(example, 'module.json'), 'utf8'));
const { sourceCommit, epoch } = await sourceIdentity();
const identity = { moduleId: template.module.id, version: template.module.version, sourceCommit };

// Never delete a directory this tool did not create.
let existing: string[] = [];
try {
  existing = await readdir(outRoot);
} catch {}
if (outRoot === kitRoot || !outRoot.startsWith(kitRoot + sep)) fail('--out must be a directory inside the kit checkout');
if (existing.length && !existing.includes(MARKER)) fail(`${outRoot} exists and was not created by example:build`);
await rm(outRoot, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
await mkdir(workDir, { recursive: true });
await writeFile(join(outRoot, MARKER), 'created by npm run example:build\n');

console.log(`building ${identity.moduleId}@${identity.version} from ${sourceCommit.slice(0, 12)}`);

await verificationStep('typecheck', 'tsc --noEmit', process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit']);
await verificationStep(
  'tests',
  'node --import tsx --test tests/*.test.ts',
  process.execPath,
  ['--import', 'tsx', '--test', '--test-reporter=tap', 'tests/*.test.ts'],
  (out) => `${/^# pass (\d+)/m.exec(out)?.[1] ?? '?'} passed, ${/^# fail (\d+)/m.exec(out)?.[1] ?? '?'} failed`,
);

console.log('> frontend static build');
const frontend = await buildFrontend({
  entry: join(example, 'frontend', 'main.tsx'),
  indexTemplate: join(example, 'frontend', 'index.html'),
  outDir: join(releaseDir, 'frontend'),
  basePath: template.module.frontendBasePath,
  identity,
});
commands.push({ command: 'esbuild frontend bundle', result: 'PASS', summary: `${frontend.files.length} assets` });

console.log('> API bundle');
const context = join(workDir, 'api-context');
await mkdir(context, { recursive: true });
await bundleApi({ entry: join(example, 'api', 'main.ts'), outFile: join(context, 'server.mjs') });
await place(join(example, 'api', 'Dockerfile'), context, 'Dockerfile');
commands.push({ command: 'esbuild API bundle (node24)', result: 'PASS' });

console.log('> API OCI image (linux/amd64)');
const archive = join(releaseDir, 'api', 'image.oci.tar');
if (archive.includes(',')) fail('the output path must not contain a comma (docker --output is comma-separated)');
await mkdir(dirname(archive), { recursive: true });
const labels = {
  'org.kns.module.id': identity.moduleId,
  'org.opencontainers.image.version': identity.version,
  'org.opencontainers.image.revision': sourceCommit,
  'org.opencontainers.image.title': template.module.name,
};
const buildArgs = [
  'buildx', 'build', '--platform', 'linux/amd64', '--provenance=false', '--sbom=false',
  '--build-arg', `SOURCE_DATE_EPOCH=${epoch}`,
  ...Object.entries(labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]),
  '--output', `type=oci,dest=${archive},rewrite-timestamp=true`,
  context,
];
const docker = await run('docker', buildArgs);
const dockerCommand = `docker buildx build --platform linux/amd64 --output type=oci ${identity.moduleId}`;
if (docker.code !== 0) {
  commands.push({ command: dockerCommand, result: 'FAIL' });
  console.error(docker.output.slice(-3000));
  fail('docker buildx could not produce the OCI archive (is Docker available with an OCI-capable builder?)');
}
const oci = checkApiImage(await readFile(archive), identity);
commands.push({ command: dockerCommand, result: 'PASS', summary: `manifest ${oci.manifestDigest}` });
commands.push({ command: 'OCI image check: linux/amd64, non-root user, identity labels', result: 'PASS' });

const dockerVersion = (await run('docker', ['version', '--format', '{{.Server.Version}}'])).output.trim();
await writeFile(join(releaseDir, 'module.json'), `${JSON.stringify(releaseModuleJson(template, { sourceCommit, manifestDigest: oci.manifestDigest }), null, 2)}\n`);
await place(join(example, 'contracts', 'openapi.json'), releaseDir, 'contracts/openapi.json');
await mkdir(join(releaseDir, 'verification'), { recursive: true });
await writeFile(
  join(releaseDir, 'verification', 'release-evidence.json'),
  `${JSON.stringify(releaseEvidence(identity, `node ${process.version}; docker ${dockerVersion}`.slice(0, 80), commands), null, 2)}\n`,
);

console.log(`\nRelease directory: ${releaseDir}`);
console.log(`Image manifest digest: ${oci.manifestDigest}`);
console.log('Next (the signing key must live OUTSIDE the release directory):');
console.log('  npm run kns -- keygen <key-id> <key-dir-outside-the-repo> --module hello');
console.log(`  npm run kns -- pack ${releaseDir} --key <key-dir>/<key-id>.private.pem --key-id <key-id> --out <package-dir>`);
console.log('  npm run kns -- verify <package-dir>/kns-hello-0.1.0.knsmod --trust <key-dir>/<key-id>.trust-store.json');

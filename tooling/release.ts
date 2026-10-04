import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { build } from 'esbuild';
import { KnsmodModuleSchema, KnsmodReleaseEvidenceSchema } from '@kns/contracts/knsmod';
import type { KnsmodModule, KnsmodReleaseEvidence } from '@kns/contracts/knsmod';
import { inspectOciArchive, type OciInspection } from '@kns/module-toolchain';

// Library behind `npm run example:build`. It assembles a *release directory* (the packer input) for a
// Type B module. Nothing here signs, packs or verifies: that stays with `kns pack` / `kns verify`.

export const ASSETS_MARKER = '<!--KNS:ASSETS-->';
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export type ReleaseIdentity = { moduleId: string; version: string; sourceCommit: string };

/** Parse and schema-check a module.json (the template or a finished release). */
export function parseModuleJson(text: string): KnsmodModule {
  const value = JSON.parse(text);
  const errors = [...Value.Errors(KnsmodModuleSchema, value)].map((e) => `${e.path || '/'}: ${e.message}`);
  if (errors.length) throw new Error(`module.json does not match the KNS module contract:\n- ${errors.join('\n- ')}`);
  return value as KnsmodModule;
}

/** Finished module.json: the template plus the real source commit and the real OCI manifest digest. */
export function releaseModuleJson(template: KnsmodModule, identity: { sourceCommit: string; manifestDigest: string }) {
  const result: KnsmodModule = {
    ...template,
    source: {
      commit: identity.sourceCommit,
      releaseId: `${template.module.id}-${template.module.version}-${identity.sourceCommit.slice(0, 12)}`,
    },
    artifacts: {
      ...template.artifacts,
      apiImage: { path: 'api/image.oci.tar', manifestDigest: identity.manifestDigest },
    },
  };
  return parseModuleJson(JSON.stringify(result));
}

export function releaseEvidence(
  identity: ReleaseIdentity,
  runtime: string,
  commands: KnsmodReleaseEvidence['commands'],
): KnsmodReleaseEvidence {
  const evidence: KnsmodReleaseEvidence = {
    moduleId: identity.moduleId,
    moduleVersion: identity.version,
    sourceCommit: identity.sourceCommit,
    runtime,
    commands,
  };
  const errors = [...Value.Errors(KnsmodReleaseEvidenceSchema, evidence)].map((e) => `${e.path || '/'}: ${e.message}`);
  if (errors.length) throw new Error(`release evidence is invalid:\n- ${errors.join('\n- ')}`);
  return evidence;
}

/** Static frontend: hashed assets under /<module>/assets/, index.html, build-info.json. No source maps. */
export async function buildFrontend(options: {
  entry: string;
  indexTemplate: string;
  outDir: string;
  basePath: string;
  identity: ReleaseIdentity;
}) {
  const assets = join(options.outDir, 'assets');
  const result = await build({
    entryPoints: [options.entry],
    outdir: assets,
    entryNames: '[name]-[hash]',
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    minify: true,
    jsx: 'automatic',
    sourcemap: false,
    legalComments: 'external',
    metafile: true,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const outputs = Object.keys(result.metafile.outputs).map((p) => p.replaceAll('\\', '/').split('/assets/').pop()!);
  const script = outputs.find((name) => name.endsWith('.js'));
  const style = outputs.find((name) => name.endsWith('.css'));
  if (!script) throw new Error('frontend build produced no JavaScript');
  const tags = [
    style ? `<link rel="stylesheet" href="${options.basePath}assets/${style}" />` : '',
    `<script type="module" crossorigin src="${options.basePath}assets/${script}"></script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
  const template = await readFile(options.indexTemplate, 'utf8');
  if (!template.includes(ASSETS_MARKER)) throw new Error(`index template lacks ${ASSETS_MARKER}`);
  await writeFile(join(options.outDir, 'index.html'), template.replace(ASSETS_MARKER, tags));
  await writeFile(
    join(options.outDir, 'build-info.json'),
    json({ moduleId: options.identity.moduleId, version: options.identity.version, sourceCommit: options.identity.sourceCommit }),
  );
  return { script, style, files: outputs };
}

/** Single-file ESM API bundle (Node 24); only Node built-ins stay external. */
export async function bundleApi(options: { entry: string; outFile: string }) {
  await build({
    entryPoints: [options.entry],
    outfile: options.outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: false,
    logLevel: 'silent',
  });
}

function tarFiles(bytes: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const text = (start: number, length: number) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(text(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const name = ((text(345, 155) ? `${text(345, 155)}/` : '') + text(0, 100)).replace(/^\.\//, '');
    if (type === '0' || type === '7') files.set(name, bytes.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

export type OciPlatform = { os: string; architecture: string };
/** The image's declared platform. The package validator checks platform only inside an image index. */
export function ociPlatform(archive: Buffer): OciPlatform {
  const files = tarFiles(archive);
  const blob = (digest: string) => {
    const data = files.get(`blobs/sha256/${digest.replace(/^sha256:/, '')}`);
    if (!data) throw new Error(`OCI blob missing: ${digest}`);
    return JSON.parse(data.toString('utf8'));
  };
  let manifest = blob(JSON.parse(files.get('index.json')?.toString('utf8') ?? '{}').manifests?.[0]?.digest ?? '');
  if (Array.isArray(manifest.manifests)) manifest = blob(manifest.manifests[0].digest);
  const config = blob(manifest.config.digest);
  return { os: String(config.os), architecture: String(config.architecture) };
}

/**
 * Developer-side acceptance of the built image, in addition to (never instead of) the package
 * validator that `kns pack` and `kns verify` run: linux/amd64, non-root, identity labels.
 */
export function checkApiImage(archive: Buffer, expected: ReleaseIdentity): OciInspection {
  const oci = inspectOciArchive(archive); // layout and digest integrity; throws on a malformed image
  const platform = ociPlatform(archive);
  const problems: string[] = [];
  if (platform.os !== 'linux' || platform.architecture !== 'amd64')
    problems.push(`image platform must be linux/amd64, got ${platform.os}/${platform.architecture}`);
  if (!oci.user || /^(0|root)(:.*)?$/.test(oci.user)) problems.push('image must run as a non-root user');
  if (oci.labels['org.kns.module.id'] !== expected.moduleId) problems.push('label org.kns.module.id differs from module.json');
  if (oci.labels['org.opencontainers.image.version'] !== expected.version)
    problems.push('label org.opencontainers.image.version differs from module.json');
  if (problems.length) throw new Error(`API image rejected:\n- ${problems.join('\n- ')}`);
  return oci;
}

/** Copy a source file into the release directory, creating parents. */
export async function place(from: string, releaseDir: string, member: string) {
  await mkdir(join(releaseDir, member, '..'), { recursive: true });
  await cp(from, join(releaseDir, member));
}

export { sha256 };

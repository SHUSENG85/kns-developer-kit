import { createHash } from 'node:crypto';
import { pathProblem } from './zip.ts';

// Read-only inspection of an OCI image layout tar (as produced by `docker save` on current
// engines). Nothing is loaded into a container runtime and no layer is extracted to disk.

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

function readTar(bytes: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  let paxPath: string | null = null;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, length: number) =>
      header
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0) throw new Error('OCI tar: invalid member size');
    const type = String.fromCharCode(header[156] || 48);
    const prefix = field(345, 155);
    let name = (prefix ? `${prefix}/` : '') + field(0, 100);
    const dataStart = offset + 512;
    const data = bytes.subarray(dataStart, dataStart + size);
    if (dataStart + size > bytes.length) throw new Error('OCI tar: member overruns archive');
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const match = /\d+ path=([^\n]*)\n/.exec(data.toString('utf8'));
      paxPath = match ? match[1] : null;
      continue;
    }
    if (type === 'g') continue;
    if (paxPath) name = paxPath;
    paxPath = null;
    name = name.replace(/^\.\//, '');
    if (type === '5') continue;
    if (type !== '0' && type !== '\0' && type !== '7')
      throw new Error(`OCI tar: link or special member not allowed: ${name}`);
    const problem = pathProblem(name);
    if (problem) throw new Error(`OCI tar: ${problem}: ${name}`);
    if (files.has(name)) throw new Error(`OCI tar: duplicate member ${name}`);
    files.set(name, data);
  }
  return files;
}

export type OciInspection = {
  manifestDigest: string;
  configDigest: string;
  layers: number;
  user: string;
  labels: Record<string, string>;
};

/** Verify layout, digests of every referenced blob and the runtime policy-relevant config. */
export function inspectOciArchive(bytes: Buffer): OciInspection {
  const files = readTar(bytes);
  const json = (name: string) => {
    const data = files.get(name);
    if (!data) throw new Error(`OCI layout missing ${name}`);
    return JSON.parse(data.toString('utf8'));
  };
  const blob = (digest: string) => {
    const match = /^sha256:([a-f0-9]{64})$/.exec(digest);
    if (!match) throw new Error(`OCI: unsupported digest ${digest}`);
    const data = files.get(`blobs/sha256/${match[1]}`);
    if (!data) throw new Error(`OCI: blob missing ${digest}`);
    if (sha256(data) !== match[1]) throw new Error(`OCI: blob digest mismatch ${digest}`);
    return data;
  };
  if (json('oci-layout').imageLayoutVersion !== '1.0.0') throw new Error('OCI: unsupported layout');
  const index = json('index.json');
  if (index.schemaVersion !== 2 || !Array.isArray(index.manifests) || index.manifests.length !== 1)
    throw new Error('OCI: index must reference exactly one image');
  let descriptor = index.manifests[0];
  let manifest = JSON.parse(blob(descriptor.digest).toString('utf8'));
  if (manifest.mediaType === 'application/vnd.oci.image.index.v1+json') {
    const platform = (manifest.manifests ?? []).filter(
      (m: any) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64',
    );
    if (platform.length !== 1) throw new Error('OCI: no single linux/amd64 image in index');
    descriptor = platform[0];
    manifest = JSON.parse(blob(descriptor.digest).toString('utf8'));
  }
  if (!manifest.config?.digest || !Array.isArray(manifest.layers))
    throw new Error('OCI: malformed image manifest');
  const config = JSON.parse(blob(manifest.config.digest).toString('utf8'));
  for (const layer of manifest.layers) blob(layer.digest);
  return {
    manifestDigest: index.manifests[0].digest,
    configDigest: manifest.config.digest,
    layers: manifest.layers.length,
    user: String(config.config?.User ?? ''),
    labels: { ...(config.config?.Labels ?? {}) },
  };
}

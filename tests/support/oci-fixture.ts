import { createHash } from 'node:crypto';

// Builds a tiny but structurally valid OCI image layout tar for tests: no Docker, no network.
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

function tarMember(name: string, data: Buffer) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.fill(' ', 148, 156);
  header.write('0', 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  header.write(`${[...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0')}\0 `, 148);
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

export function buildOciArchive(options: {
  user?: string;
  labels?: Record<string, string>;
  os?: string;
  architecture?: string;
}) {
  const blob = (value: unknown) => Buffer.from(JSON.stringify(value));
  const layer = Buffer.concat([tarMember('app/server.mjs', Buffer.from('// fixture\n')), Buffer.alloc(1024)]);
  const config = blob({
    os: options.os ?? 'linux',
    architecture: options.architecture ?? 'amd64',
    config: { User: options.user ?? '10001:10001', Labels: options.labels ?? {} },
    rootfs: { type: 'layers', diff_ids: [`sha256:${sha(layer)}`] },
  });
  const manifest = blob({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: `sha256:${sha(config)}`, size: config.length },
    layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: `sha256:${sha(layer)}`, size: layer.length }],
  });
  const index = blob({
    schemaVersion: 2,
    manifests: [{ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: `sha256:${sha(manifest)}`, size: manifest.length }],
  });
  const members: Array<[string, Buffer]> = [
    ['oci-layout', blob({ imageLayoutVersion: '1.0.0' })],
    ['index.json', index],
    [`blobs/sha256/${sha(manifest)}`, manifest],
    [`blobs/sha256/${sha(config)}`, config],
    [`blobs/sha256/${sha(layer)}`, layer],
  ];
  return {
    archive: Buffer.concat([...members.map(([name, data]) => tarMember(name, data)), Buffer.alloc(1024)]),
    manifestDigest: `sha256:${sha(manifest)}`,
  };
}

export const helloLabels = (version = '0.1.0') => ({
  'org.kns.module.id': 'hello',
  'org.opencontainers.image.version': version,
});

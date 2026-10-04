import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import {
  KNSMOD_SIGNATURE_DOMAIN,
  type KnsmodSignature,
  type KnsmodTrustStore,
} from '@kns/contracts/knsmod';

// Ed25519 publisher signatures. Only the detached signature and key ID travel in a package; private
// keys stay with the publisher and trust is decided by the operator-controlled trust store.

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const message = (manifest: Buffer) =>
  Buffer.concat([Buffer.from(`${KNSMOD_SIGNATURE_DOMAIN}\n`, 'utf8'), manifest]);
export const sha256Hex = (data: Buffer) => createHash('sha256').update(data).digest('hex');

export function generatePublisherKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKey: spki.subarray(SPKI_PREFIX.length).toString('base64'),
  };
}

export function publicKeyOf(privateKeyPem: string) {
  const spki = createPublicKey(createPrivateKey(privateKeyPem)).export({
    format: 'der',
    type: 'spki',
  });
  return spki.subarray(SPKI_PREFIX.length).toString('base64');
}

export function signManifest(
  manifest: Buffer,
  privateKeyPem: string,
  keyId: string,
): KnsmodSignature {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Publisher key must be Ed25519');
  return {
    algorithm: 'ed25519',
    keyId,
    signedFile: 'package-manifest.json',
    signedSha256: sha256Hex(manifest),
    signature: sign(null, message(manifest), key).toString('base64'),
  };
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/** Verify against the trust store: known, unrevoked key, authorised for this module ID. */
export function verifyManifestSignature(
  manifest: Buffer,
  signature: KnsmodSignature,
  moduleId: string,
  trust: KnsmodTrustStore,
): SignatureCheck {
  if (sha256Hex(manifest) !== signature.signedSha256)
    return { ok: false, reason: 'signature does not cover this package manifest' };
  const matches = trust.keys.filter((key) => key.keyId === signature.keyId);
  if (matches.length !== 1)
    return { ok: false, reason: `untrusted signing key: ${signature.keyId}` };
  const key = matches[0];
  if (key.revoked) return { ok: false, reason: `revoked signing key: ${key.keyId}` };
  if (!key.modules.includes(moduleId))
    return { ok: false, reason: `key ${key.keyId} is not authorised for module ${moduleId}` };
  const raw = Buffer.from(key.publicKey, 'base64');
  if (raw.length !== 32) return { ok: false, reason: 'trust store public key is malformed' };
  const publicKey = createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
  const valid = verify(
    null,
    message(manifest),
    publicKey,
    Buffer.from(signature.signature, 'base64'),
  );
  return valid ? { ok: true } : { ok: false, reason: 'signature verification failed' };
}

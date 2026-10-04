import { Type, type Static } from '@sinclair/typebox';
import { CONTRACT_VERSION, ModuleV2Schema } from './module-contract.ts';

// KNS Module Package v1 (.knsmod) metadata contracts. module.json embeds the Platform Contract v2
// module manifest unchanged: there is no second, competing module contract.
export const KNSMOD_PACKAGE_SPEC = '1.0.0';
export const KNSMOD_SIGNATURE_DOMAIN = 'KNSMOD-V1-SIGNATURE';
export const KNSMOD_TOOL = 'kns-knsmod/1.0.0';

export const KnsmodSemver = Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+(?:-[a-zA-Z0-9.-]+)?$' });
export const KnsmodSha256 = Type.String({ pattern: '^[a-f0-9]{64}$' });
const Commit = Type.String({ pattern: '^[a-f0-9]{40}$' });
// Package member path: forward slashes, no absolute/dot/empty segments. The validator applies the
// complete archive path policy; this pattern is the schema-level first line.
export const KnsmodPath = Type.String({
  minLength: 1,
  maxLength: 512,
  pattern: '^(?!/)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)(?!.*\\\\)[^\\x00-\\x1f]+$',
});

export const KnsmodShape = Type.Union([Type.Literal('A'), Type.Literal('B')]);

export const KnsmodModuleSchema = Type.Object(
  {
    packageSpecVersion: Type.Literal(KNSMOD_PACKAGE_SPEC),
    // A: immutable static frontend only. B: API (OCI image), optional frontend and migrations.
    shape: KnsmodShape,
    module: ModuleV2Schema,
    source: Type.Object(
      { commit: Commit, releaseId: Type.String({ minLength: 1, maxLength: 160 }) },
      { additionalProperties: false },
    ),
    compatibility: Type.Object(
      {
        platformContract: Type.Literal(CONTRACT_VERSION),
        // Installed versions this release may upgrade from / roll back to without a database change.
        upgradeFrom: Type.Array(KnsmodSemver, { uniqueItems: true, maxItems: 50 }),
        rollbackTo: Type.Array(KnsmodSemver, { uniqueItems: true, maxItems: 50 }),
      },
      { additionalProperties: false },
    ),
    artifacts: Type.Object(
      {
        frontend: Type.Optional(Type.Literal('frontend')),
        apiImage: Type.Optional(
          Type.Object(
            {
              path: Type.Literal('api/image.oci.tar'),
              manifestDigest: Type.String({ pattern: '^sha256:[a-f0-9]{64}$' }),
            },
            { additionalProperties: false },
          ),
        ),
        openapi: Type.Optional(Type.Literal('contracts/openapi.json')),
        // Declarative runtime ACL (design §21); required whenever migrations are shipped.
        databaseAccess: Type.Optional(Type.Literal('contracts/database-access.json')),
        migrations: Type.Array(
          Type.String({ pattern: '^migrations/[0-9]{4}_[a-z0-9_]{1,60}\\.sql$' }),
          { uniqueItems: true, maxItems: 200 },
        ),
        releaseEvidence: Type.Literal('verification/release-evidence.json'),
      },
      { additionalProperties: false },
    ),
    // Identifiers and types only; values are provisioned server-side and never packaged.
    requiredSecrets: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: '^[A-Z][A-Z0-9_]{1,79}$' }),
          type: Type.Union([
            Type.Literal('opaque'),
            Type.Literal('database-url'),
            Type.Literal('api-key'),
          ]),
        },
        { additionalProperties: false },
      ),
      { uniqueItems: true, maxItems: 20 },
    ),
  },
  { additionalProperties: false },
);
export type KnsmodModule = Static<typeof KnsmodModuleSchema>;

const KnsmodIdentifier = Type.String({ pattern: '^[a-z][a-z0-9_]{0,62}$' });
/** Runtime privileges KNS grants to kns_<id> after migrations; fixed vocabulary (design §21). */
export const KnsmodDatabaseAccessSchema = Type.Object(
  {
    schemas: Type.Record(
      KnsmodIdentifier,
      Type.Object(
        {
          tables: Type.Record(
            KnsmodIdentifier,
            Type.Array(
              Type.Union(['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((p) => Type.Literal(p))),
              { minItems: 1, maxItems: 4, uniqueItems: true },
            ),
          ),
          sequences: Type.Record(
            KnsmodIdentifier,
            Type.Array(Type.Union([Type.Literal('USAGE'), Type.Literal('SELECT')]), {
              minItems: 1,
              maxItems: 2,
              uniqueItems: true,
            }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type KnsmodDatabaseAccess = Static<typeof KnsmodDatabaseAccessSchema>;

export const KnsmodEntrySchema = Type.Object(
  {
    path: KnsmodPath,
    sha256: KnsmodSha256,
    size: Type.Integer({ minimum: 0 }),
    mediaType: Type.String({ pattern: '^[a-z]+/[a-z0-9.+-]+$', maxLength: 160 }),
  },
  { additionalProperties: false },
);

export const KnsmodPackageManifestSchema = Type.Object(
  {
    packageSpecVersion: Type.Literal(KNSMOD_PACKAGE_SPEC),
    tool: Type.String({ minLength: 1, maxLength: 80 }),
    moduleId: ModuleV2Schema.properties.id,
    moduleVersion: ModuleV2Schema.properties.version,
    sourceCommit: Commit,
    // Every member except package-manifest.json and signature.json, sorted by path.
    entries: Type.Array(KnsmodEntrySchema, { minItems: 2, maxItems: 5000 }),
  },
  { additionalProperties: false },
);
export type KnsmodPackageManifest = Static<typeof KnsmodPackageManifestSchema>;

export const KnsmodSignatureSchema = Type.Object(
  {
    algorithm: Type.Literal('ed25519'),
    keyId: Type.String({ pattern: '^[a-z0-9][a-z0-9._-]{2,79}$' }),
    signedFile: Type.Literal('package-manifest.json'),
    signedSha256: KnsmodSha256,
    // Base64 Ed25519 signature over `${KNSMOD_SIGNATURE_DOMAIN}\n` + package-manifest.json bytes.
    signature: Type.String({ pattern: '^[A-Za-z0-9+/]{86}==$' }),
  },
  { additionalProperties: false },
);
export type KnsmodSignature = Static<typeof KnsmodSignatureSchema>;

export const KnsmodReleaseEvidenceSchema = Type.Object(
  {
    moduleId: ModuleV2Schema.properties.id,
    moduleVersion: ModuleV2Schema.properties.version,
    sourceCommit: Commit,
    runtime: Type.String({ minLength: 1, maxLength: 80 }),
    commands: Type.Array(
      Type.Object(
        {
          command: Type.String({ minLength: 1, maxLength: 500 }),
          result: Type.Union([Type.Literal('PASS'), Type.Literal('FAIL')]),
          summary: Type.Optional(Type.String({ maxLength: 500 })),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 100 },
    ),
  },
  { additionalProperties: false },
);
export type KnsmodReleaseEvidence = Static<typeof KnsmodReleaseEvidenceSchema>;

// Operator-controlled trust store (Core/operator configuration, never inside a package).
export const KnsmodTrustStoreSchema = Type.Object(
  {
    keys: Type.Array(
      Type.Object(
        {
          keyId: KnsmodSignatureSchema.properties.keyId,
          // Base64 of the 32-byte raw Ed25519 public key.
          publicKey: Type.String({ pattern: '^[A-Za-z0-9+/]{43}=$' }),
          // Module IDs this publisher key may sign; no wildcard.
          modules: Type.Array(ModuleV2Schema.properties.id, { minItems: 1, uniqueItems: true }),
          revoked: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      { maxItems: 100 },
    ),
  },
  { additionalProperties: false },
);
export type KnsmodTrustStore = Static<typeof KnsmodTrustStoreSchema>;

// Platform state the install validator checks against (supplied by Core / operator tooling).
export type KnsmodPlatformContext = {
  supportedPlatformContracts: readonly string[];
  installedModules: ReadonlyArray<{
    id: string;
    version: string;
    frontendBasePath: string;
    apiBasePath: string;
    ownedSchemas: readonly string[];
    providesCapabilities: ReadonlyArray<{ id: string; version: string }>;
  }>;
  capabilities: ReadonlyArray<{ id: string; version: string; providerModuleId: string }>;
};

export const KNSMOD_PACKAGE_STATES = [
  'UPLOADED',
  'VALIDATING',
  'VALIDATED',
  'REVIEW_REQUIRED',
  'READY',
  'INSTALLING',
  'INSTALLED',
  'FAILED',
  'QUARANTINED',
] as const;
export const KNSMOD_RUNTIME_STATES = ['DISABLED', 'ENABLED', 'MAINTENANCE'] as const;
export const KNSMOD_RELEASE_STATES = ['STAGED', 'ACTIVE', 'ROLLED_BACK', 'FAILED'] as const;

import { Value } from '@sinclair/typebox/value';
import {
  KnsmodDatabaseAccessSchema,
  KnsmodModuleSchema,
  KnsmodPackageManifestSchema,
  KnsmodReleaseEvidenceSchema,
  KnsmodSignatureSchema,
  KnsmodTrustStoreSchema,
  type KnsmodDatabaseAccess,
  type KnsmodModule,
  type KnsmodPackageManifest,
  type KnsmodPlatformContext,
  type KnsmodReleaseEvidence,
  type KnsmodSignature,
  type KnsmodTrustStore,
} from '@kns/contracts/knsmod';
import { validateCapabilityDeclarations } from './capabilities.ts';
import { ArchiveError, DEFAULT_ZIP_LIMITS, readZip, type ZipLimits } from './zip.ts';
import { inspectOciArchive } from './oci.ts';
import { parsedMigrationProblems } from './sqlparser.ts';
import { sha256Hex, verifyManifestSignature } from './signing.ts';
import {
  RESERVED_API_PATHS,
  RESERVED_FRONTEND_PATHS,
  RESERVED_MODULE_IDS,
  RESERVED_SCHEMAS,
  allowedMember,
  databaseAccessProblems,
  mediaTypeOf,
  migrationProblems,
  permissionProblems,
  sensitiveFindings,
} from './policy.ts';

export const STAGES = [
  ['archive', 'Archive safety'],
  ['structure', 'Required structure and allowed members'],
  ['manifest', 'Package manifest schema'],
  ['inventory', 'File inventory and SHA-256 digests'],
  ['sensitive', 'Secrets and personal-data scan'],
  ['signature', 'Publisher signature and trusted key'],
  ['module', 'Module contract schema'],
  ['identity', 'Module ID, version and source consistency'],
  ['platform', 'Platform Contract and upgrade compatibility'],
  ['capabilities', 'Required/optional/provided capabilities'],
  ['permissions', 'Requested permission review'],
  ['routes', 'Route, module ID and schema ownership conflicts'],
  ['artifacts', 'Frontend, OpenAPI and OCI artifact consistency'],
  ['migrations', 'Migration policy (additive, owned schema only)'],
  ['evidence', 'Release evidence'],
] as const;
export type StageId = (typeof STAGES)[number][0];
export type StageStatus = 'PASS' | 'FAIL' | 'NOT_EVALUATED';
export type StageResult = { id: StageId; label: string; status: StageStatus; findings: string[] };
const PLATFORM_STAGES: StageId[] = ['platform', 'capabilities', 'routes'];

export type ValidationReport = {
  // VALIDATED: every stage passed against a platform context (eligible for controlled review).
  // PACKAGE_VERIFIED: integrity, signature and static policy passed; platform not evaluated.
  status: 'VALIDATED' | 'PACKAGE_VERIFIED' | 'INSTALL_BLOCKED';
  packageSha256: string;
  moduleId: string | null;
  moduleVersion: string | null;
  stages: StageResult[];
  review: {
    permissions: string[];
    requiredCapabilities: string[];
    optionalCapabilities: Array<{ id: string; available: boolean | null }>;
    providesCapabilities: string[];
    migrations: string[];
    requiredSecrets: string[];
    routes: { frontend: string | null; api: string | null };
    upgradeFrom: string | null;
  } | null;
};

export type ValidationOptions = {
  trustStore: KnsmodTrustStore;
  platform?: KnsmodPlatformContext;
  filename?: string;
  limits?: ZipLimits;
};

const semverParts = (v: string) => v.split('-')[0].split('.').map(Number);
export function compareSemver(a: string, b: string) {
  const x = semverParts(a),
    y = semverParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  const pa = a.includes('-'),
    pb = b.includes('-');
  return pa === pb ? a.localeCompare(b) : pa ? -1 : 1;
}

const schemaErrors = (label: string, schema: Parameters<typeof Value.Errors>[0], value: unknown) =>
  [...Value.Errors(schema, value)]
    .slice(0, 20)
    .map((e) => `${label}${e.path || '/'}: ${e.message}`);

function parseJson(data: Buffer | undefined, label: string, findings: string[]) {
  if (!data) {
    findings.push(`${label} is missing`);
    return undefined;
  }
  try {
    return JSON.parse(data.toString('utf8'));
  } catch {
    findings.push(`${label} is not valid JSON`);
    return undefined;
  }
}

/** Fail-closed .knsmod validation. Never executes, loads or extracts package content to disk. */
export function validatePackage(bytes: Buffer, options: ValidationOptions): ValidationReport {
  const stage = new Map<StageId, StageResult>(
    STAGES.map(([id, label]) => [id, { id, label, status: 'NOT_EVALUATED', findings: [] }]),
  );
  const done = (id: StageId, findings: string[]) => {
    const s = stage.get(id)!;
    s.findings.push(...findings);
    s.status = s.findings.length ? 'FAIL' : 'PASS';
  };
  const report = (
    moduleId: string | null,
    moduleVersion: string | null,
    review: ValidationReport['review'],
  ): ValidationReport => {
    const stages = [...stage.values()];
    const failed = stages.some((s) => s.status === 'FAIL');
    const unevaluated = stages.filter((s) => s.status === 'NOT_EVALUATED').map((s) => s.id);
    const status = failed
      ? 'INSTALL_BLOCKED'
      : unevaluated.length === 0
        ? 'VALIDATED'
        : !options.platform && unevaluated.every((id) => PLATFORM_STAGES.includes(id))
          ? 'PACKAGE_VERIFIED'
          : 'INSTALL_BLOCKED';
    return { status, packageSha256: sha256Hex(bytes), moduleId, moduleVersion, stages, review };
  };

  // Trust store is operator input: a malformed one blocks everything (never "trust all").
  const trustErrors = schemaErrors('trust store', KnsmodTrustStoreSchema, options.trustStore);
  if (trustErrors.length) {
    done('signature', trustErrors);
    return report(null, null, null);
  }

  // 1. Archive safety
  let members: Map<string, Buffer>;
  try {
    members = new Map(
      readZip(bytes, options.limits ?? DEFAULT_ZIP_LIMITS).map((m) => [m.name, m.data]),
    );
    done('archive', []);
  } catch (error) {
    done('archive', [
      error instanceof ArchiveError
        ? `${error.code}: ${error.message}`
        : 'archive could not be read',
    ]);
    return report(null, null, null);
  }

  // 2. Structure
  const structure: string[] = [];
  for (const name of members.keys())
    if (!allowedMember(name)) structure.push(`unexpected member: ${name}`);
  for (const name of [
    'module.json',
    'package-manifest.json',
    'signature.json',
    'verification/release-evidence.json',
  ])
    if (!members.has(name)) structure.push(`required member missing: ${name}`);
  done('structure', structure);

  // 3. Manifest schema
  const manifestFindings: string[] = [];
  const manifestBytes = members.get('package-manifest.json');
  const manifestJson = parseJson(manifestBytes, 'package-manifest.json', manifestFindings);
  if (manifestJson !== undefined)
    manifestFindings.push(
      ...schemaErrors('package-manifest.json', KnsmodPackageManifestSchema, manifestJson),
    );
  done('manifest', manifestFindings);
  const manifest =
    stage.get('manifest')!.status === 'PASS' ? (manifestJson as KnsmodPackageManifest) : null;

  // 4. Inventory: exactly the archive members (minus manifest/signature), digests, sizes, types.
  if (manifest) {
    const inventory: string[] = [];
    const paths = manifest.entries.map((e) => e.path);
    const sorted = [...paths].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    if (JSON.stringify(paths) !== JSON.stringify(sorted))
      inventory.push('manifest entries are not sorted by path');
    if (new Set(paths.map((p) => p.toLowerCase())).size !== paths.length)
      inventory.push('manifest contains duplicate or case-colliding paths');
    const expected = [...members.keys()].filter(
      (n) => n !== 'package-manifest.json' && n !== 'signature.json',
    );
    for (const name of expected)
      if (!paths.includes(name)) inventory.push(`archive member not inventoried: ${name}`);
    for (const entry of manifest.entries) {
      const data = members.get(entry.path);
      if (!data) {
        inventory.push(`inventoried file absent from archive: ${entry.path}`);
        continue;
      }
      if (data.length !== entry.size) inventory.push(`size mismatch: ${entry.path}`);
      if (sha256Hex(data) !== entry.sha256) inventory.push(`SHA-256 mismatch: ${entry.path}`);
      if (mediaTypeOf(entry.path) !== entry.mediaType)
        inventory.push(`media type mismatch: ${entry.path}`);
    }
    for (const name of ['package-manifest.json', 'signature.json'])
      if (paths.includes(name)) inventory.push(`${name} must not inventory itself`);
    done('inventory', inventory);
  }

  // 5. Sensitive content (every member, names and text content)
  const sensitive: string[] = [];
  for (const [name, data] of members)
    if (name !== 'api/image.oci.tar') sensitive.push(...sensitiveFindings(name, data));
  done('sensitive', sensitive);

  // 7. Module contract (parsed before the signature check so the key's module scope is known)
  const moduleFindings: string[] = [];
  const moduleJson = parseJson(members.get('module.json'), 'module.json', moduleFindings);
  if (moduleJson !== undefined)
    moduleFindings.push(...schemaErrors('module.json', KnsmodModuleSchema, moduleJson));
  const pkg = moduleFindings.length ? null : (moduleJson as KnsmodModule);
  if (pkg) {
    if (
      pkg.shape === 'A' &&
      (pkg.artifacts.apiImage || pkg.artifacts.migrations.length || pkg.artifacts.openapi)
    )
      moduleFindings.push(
        'shape A packages carry only a frontend (no API image, OpenAPI or migrations)',
      );
    if (pkg.shape === 'A' && !pkg.artifacts.frontend)
      moduleFindings.push('shape A requires a frontend artifact');
    // Owner decision 2026-10-03: external v1 modules must include an API (Contract v2).
    if (pkg.shape === 'A')
      moduleFindings.push(
        'frontend-only (shape A) external modules are deferred to a future contract version; Module Package v1 requires an API component',
      );
    if (pkg.shape === 'B' && !pkg.artifacts.apiImage)
      moduleFindings.push('shape B requires an API image artifact');
    if (pkg.compatibility.platformContract !== pkg.module.requiredPlatformContract)
      moduleFindings.push(
        'compatibility.platformContract differs from module.requiredPlatformContract',
      );
  }
  done('module', moduleFindings);

  // 6. Signature
  const signatureFindings: string[] = [];
  const signatureJson = parseJson(
    members.get('signature.json'),
    'signature.json',
    signatureFindings,
  );
  if (signatureJson !== undefined)
    signatureFindings.push(...schemaErrors('signature.json', KnsmodSignatureSchema, signatureJson));
  if (!signatureFindings.length && manifestBytes) {
    const moduleId = pkg?.module.id ?? manifest?.moduleId;
    if (!moduleId)
      signatureFindings.push('module identity unknown; signature scope cannot be checked');
    else {
      const check = verifyManifestSignature(
        manifestBytes,
        signatureJson as KnsmodSignature,
        moduleId,
        options.trustStore,
      );
      if (!check.ok) signatureFindings.push(check.reason);
    }
  }
  done('signature', signatureFindings);

  // 15. Release evidence
  const evidenceFindings: string[] = [];
  const evidenceJson = parseJson(
    members.get('verification/release-evidence.json'),
    'release evidence',
    evidenceFindings,
  );
  if (evidenceJson !== undefined)
    evidenceFindings.push(
      ...schemaErrors(
        'verification/release-evidence.json',
        KnsmodReleaseEvidenceSchema,
        evidenceJson,
      ),
    );
  const evidence = evidenceFindings.length ? null : (evidenceJson as KnsmodReleaseEvidence);
  if (evidence)
    for (const item of evidence.commands)
      if (item.result !== 'PASS')
        evidenceFindings.push(`required verification failed: ${item.command}`);
  done('evidence', evidenceFindings);

  if (!pkg) return report(manifest?.moduleId ?? null, manifest?.moduleVersion ?? null, null);
  const mod = pkg.module;

  // 8. Identity
  const identity: string[] = [];
  if (manifest) {
    if (manifest.moduleId !== mod.id)
      identity.push('package-manifest moduleId differs from module.json');
    if (manifest.moduleVersion !== mod.version)
      identity.push('package-manifest moduleVersion differs from module.json');
    if (manifest.sourceCommit !== pkg.source.commit)
      identity.push('package-manifest sourceCommit differs from module.json');
  } else identity.push('package manifest unavailable');
  if (evidence) {
    if (
      evidence.moduleId !== mod.id ||
      evidence.moduleVersion !== mod.version ||
      evidence.sourceCommit !== pkg.source.commit
    )
      identity.push('release evidence identity differs from module.json');
  }
  if (options.filename && options.filename !== `kns-${mod.id}-${mod.version}.knsmod`)
    identity.push(`file name must be kns-${mod.id}-${mod.version}.knsmod`);
  done('identity', identity);

  // 11. Permissions
  done('permissions', permissionProblems(mod.id, mod.permissions));

  // 13. Artifacts
  const artifacts: string[] = [];
  const frontendFiles = [...members.keys()].filter((n) => n.startsWith('frontend/'));
  if (pkg.artifacts.frontend) {
    if (!members.has('frontend/index.html')) artifacts.push('frontend/index.html missing');
    const info = parseJson(
      members.get('frontend/build-info.json'),
      'frontend/build-info.json',
      artifacts,
    );
    if (info && (info.moduleId !== mod.id || info.version !== mod.version))
      artifacts.push('frontend/build-info.json identity differs from module.json');
  } else if (frontendFiles.length)
    artifacts.push('frontend files present but no frontend artifact declared');
  if (pkg.artifacts.openapi) {
    const doc = parseJson(
      members.get('contracts/openapi.json'),
      'contracts/openapi.json',
      artifacts,
    );
    if (doc)
      for (const path of Object.keys(doc.paths ?? {}))
        if (path !== mod.apiBasePath && !path.startsWith(`${mod.apiBasePath}/`))
          artifacts.push(`OpenAPI path outside ${mod.apiBasePath}: ${path}`);
  } else if (members.has('contracts/openapi.json'))
    artifacts.push('OpenAPI present but not declared');
  if (pkg.artifacts.apiImage) {
    const image = members.get('api/image.oci.tar');
    if (!image) artifacts.push('api/image.oci.tar missing');
    else {
      try {
        const oci = inspectOciArchive(image);
        if (oci.manifestDigest !== pkg.artifacts.apiImage.manifestDigest)
          artifacts.push('OCI manifest digest differs from module.json');
        if (!oci.user || /^(0|root)(:.*)?$/.test(oci.user))
          artifacts.push('OCI image must run as a non-root user');
        if (
          oci.labels['org.kns.module.id'] !== mod.id ||
          oci.labels['org.opencontainers.image.version'] !== mod.version
        )
          artifacts.push(
            'OCI labels must carry org.kns.module.id and org.opencontainers.image.version of this release',
          );
      } catch (error) {
        artifacts.push(error instanceof Error ? error.message : 'OCI archive invalid');
      }
    }
  } else if (members.has('api/image.oci.tar')) artifacts.push('API image present but not declared');
  done('artifacts', artifacts);

  // 14. Migrations
  const migrations: string[] = [];
  const present = [...members.keys()].filter((n) => n.startsWith('migrations/')).sort();
  const declared = [...pkg.artifacts.migrations].sort();
  if (JSON.stringify(present) !== JSON.stringify(declared))
    migrations.push('migration files differ from module.json declaration');
  if (JSON.stringify(pkg.artifacts.migrations) !== JSON.stringify(declared))
    migrations.push('migrations must be declared in order');
  for (const name of declared) {
    const data = members.get(name);
    if (data)
      migrations.push(
        ...[
          // Real PostgreSQL grammar first, then the independent textual allowlist (both must pass).
          ...parsedMigrationProblems(mod.ownedSchemas, data.toString('utf8')),
          ...migrationProblems(mod.id, mod.ownedSchemas, data.toString('utf8')),
        ].map((p) => `${name}: ${p}`),
      );
  }
  const accessPath = 'contracts/database-access.json';
  if (pkg.artifacts.databaseAccess) {
    const access = parseJson(members.get(accessPath), accessPath, migrations);
    if (access !== undefined) {
      const errors = schemaErrors(accessPath, KnsmodDatabaseAccessSchema, access);
      migrations.push(
        ...(errors.length
          ? errors
          : databaseAccessProblems(mod.ownedSchemas, access as KnsmodDatabaseAccess)),
      );
    }
  } else if (members.has(accessPath))
    migrations.push('database-access.json present but not declared');
  if (declared.length && !pkg.artifacts.databaseAccess)
    migrations.push('packages with migrations must declare contracts/database-access.json');
  done('migrations', migrations);

  // Route/ID/schema rules that need no platform state are always enforced.
  const routes: string[] = [];
  if (RESERVED_MODULE_IDS.has(mod.id)) routes.push(`reserved module ID: ${mod.id}`);
  if (mod.frontendBasePath !== `/${mod.id}/`) routes.push(`frontendBasePath must be /${mod.id}/`);
  if (mod.apiBasePath !== `/api/v1/${mod.id}`) routes.push(`apiBasePath must be /api/v1/${mod.id}`);
  if (mod.healthPath !== `/api/v1/${mod.id}/health`)
    routes.push(`healthPath must be /api/v1/${mod.id}/health`);
  for (const p of RESERVED_FRONTEND_PATHS)
    if (mod.frontendBasePath.startsWith(p)) routes.push(`reserved route ${p}`);
  for (const p of RESERVED_API_PATHS)
    if (mod.apiBasePath.startsWith(p)) routes.push(`reserved API route ${p}`);
  for (const s of mod.ownedSchemas)
    if (RESERVED_SCHEMAS.has(s)) routes.push(`reserved schema: ${s}`);

  const review: ValidationReport['review'] = {
    permissions: [...mod.permissions],
    requiredCapabilities: mod.requiredCapabilities.map((c) => `${c.id} ${c.versionRange}`),
    optionalCapabilities: mod.optionalCapabilities.map((c) => ({ id: c.id, available: null })),
    providesCapabilities: mod.providesCapabilities.map((c) => `${c.id}@${c.version}`),
    migrations: [...pkg.artifacts.migrations],
    requiredSecrets: pkg.requiredSecrets.map((s) => `${s.id} (${s.type})`),
    routes: {
      frontend: pkg.artifacts.frontend ? mod.frontendBasePath : null,
      api: pkg.shape === 'B' ? mod.apiBasePath : null,
    },
    upgradeFrom: null,
  };

  if (!options.platform) {
    if (routes.length) done('routes', routes);
    return report(mod.id, mod.version, review);
  }
  const platform = options.platform;
  const others = platform.installedModules.filter((m) => m.id !== mod.id);
  const installed = platform.installedModules.find((m) => m.id === mod.id);

  // 9. Platform compatibility and upgrade path
  const compat: string[] = [];
  if (!platform.supportedPlatformContracts.includes(mod.requiredPlatformContract))
    compat.push(`Platform Contract ${mod.requiredPlatformContract} is not supported by this KNS`);
  if (installed) {
    review.upgradeFrom = installed.version;
    if (compareSemver(mod.version, installed.version) <= 0)
      compat.push(
        `installed ${installed.version} is not older than package ${mod.version} (releases are immutable)`,
      );
    else if (!pkg.compatibility.upgradeFrom.includes(installed.version))
      compat.push(`package does not declare upgradeFrom ${installed.version}`);
    else if (!pkg.compatibility.rollbackTo.includes(installed.version))
      compat.push(
        `package does not declare rollbackTo ${installed.version} (rollback must stay schema-compatible)`,
      );
  }
  done('platform', compat);

  // 10. Capabilities
  const caps: string[] = [];
  try {
    validateCapabilityDeclarations(mod);
  } catch (error) {
    caps.push(error instanceof Error ? error.message : 'invalid capability declarations');
  }
  const major = (range: string) => Number(range.slice(1).split('.')[0]);
  const provided = (id: string, range: string) =>
    platform.capabilities.some(
      (c) =>
        c.id === id &&
        Number(c.version.split('.')[0]) === major(range) &&
        c.providerModuleId !== mod.id,
    );
  for (const req of mod.requiredCapabilities)
    if (!provided(req.id, req.versionRange))
      caps.push(`required capability unavailable: ${req.id} ${req.versionRange}`);
  review.optionalCapabilities = mod.optionalCapabilities.map((c) => ({
    id: c.id,
    available: provided(c.id, c.versionRange),
  }));
  for (const cap of mod.providesCapabilities) {
    const owner = platform.capabilities.find(
      (c) => c.id === cap.id && c.providerModuleId !== mod.id,
    );
    if (owner) caps.push(`capability ${cap.id} is already provided by ${owner.providerModuleId}`);
  }
  done('capabilities', caps);

  // 12. Routes/schemas against installed modules
  for (const other of others) {
    if (other.frontendBasePath === mod.frontendBasePath)
      routes.push(`frontend route conflicts with ${other.id}`);
    if (other.apiBasePath === mod.apiBasePath) routes.push(`API route conflicts with ${other.id}`);
    for (const s of mod.ownedSchemas)
      if (other.ownedSchemas.includes(s)) routes.push(`schema ${s} is owned by ${other.id}`);
  }
  if (installed)
    for (const s of installed.ownedSchemas)
      if (!mod.ownedSchemas.includes(s)) routes.push(`upgrade drops previously owned schema ${s}`);
  done('routes', routes);

  return report(mod.id, mod.version, review);
}

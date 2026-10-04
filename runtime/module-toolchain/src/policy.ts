// Static, fail-closed install policy for .knsmod packages. Nothing here executes package content.
import type { KnsmodDatabaseAccess } from '@kns/contracts/knsmod';

export const RESERVED_MODULE_IDS = new Set([
  'core',
  'identity',
  'platform',
  'staff',
  'public',
  'admin',
  'api',
  'foundation',
  'preview',
  'esys',
  'erph',
  'staf',
  'server',
  'health',
  // Owned by the legacy system on smkkn.top (gateway design v1): its SPA routes (/admin, /erph,
  // /esys, /staf, /settings, static /assets) and its /api/v1/<segment> API. A package module's
  // /<id>/ and /api/v1/<id> must never shadow them.
  'settings',
  'assets',
  'students',
  'results',
  'snapshot',
  'sync',
  'meta',
  'agnes',
  'data',
  // Platform release-root and gateway internals.
  'internal',
  'routes',
]);
// Platform-owned schemas plus PostgreSQL system schemas; installed modules' schemas are added
// from the platform context at validation time.
export const RESERVED_SCHEMAS = new Set([
  'public',
  'core',
  'identity',
  'platform',
  'migrations',
  'module_ledger',
  'pg_catalog',
  'information_schema',
]);
// Legacy and platform routes no package may claim (prefix match).
export const RESERVED_FRONTEND_PATHS = [
  '/staf/',
  '/esys/',
  '/erph/',
  '/admin/',
  '/foundation/',
  '/preview/',
  '/api/',
];
export const RESERVED_API_PATHS = [
  '/api/v1/core',
  '/api/v1/identity',
  '/api/v1/platform',
  '/api/v1/health',
];

export const MEDIA_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
  '.sql': 'application/sql',
  '.tar': 'application/x-tar',
};
export const mediaTypeOf = (path: string) => {
  const ext = /\.[a-z0-9]+$/i.exec(path)?.[0]?.toLowerCase() ?? '';
  return MEDIA_TYPES[ext] ?? null;
};

/** Only these members may exist in a package (frontend files are bounded by media type). */
export function allowedMember(path: string): boolean {
  if (
    [
      'module.json',
      'package-manifest.json',
      'signature.json',
      'verification/release-evidence.json',
      'contracts/openapi.json',
      'contracts/database-access.json',
      'api/image.oci.tar',
    ].includes(path)
  )
    return true;
  if (/^migrations\/[0-9]{4}_[a-z0-9_]{1,60}\.sql$/.test(path)) return true;
  if (path.startsWith('frontend/'))
    return mediaTypeOf(path) !== null && !path.endsWith('.sql') && !path.endsWith('.tar');
  return false;
}

const SECRET_NAME = [
  /(^|\/)\.env(\.|$)/i,
  /\.(pem|key|p12|pfx|jks|kdbx|dump|bak|sqlite3?|db)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.|$)/i,
  /\.(sql\.gz|tar\.enc|enc)$/i,
  /(^|\/)\.(npmrc|git|ssh)(\/|$)/i,
];
const SECRET_CONTENT: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key material'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JSON Web Token'],
  [/postgres(?:ql)?:\/\/[^\s:@/'"]+:[^\s@/'"]+@/, 'database URL with password'],
  [/\b\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-\d{2}-\d{4}\b/, 'Malaysian IC number'],
];

/** Secret / personal-data findings for one member (names always, text content when textual). */
export function sensitiveFindings(path: string, data: Buffer): string[] {
  const findings: string[] = [];
  if (SECRET_NAME.some((pattern) => pattern.test(path)))
    findings.push(`${path}: secret-like file name`);
  const type = mediaTypeOf(path);
  if (type && /^(text\/|application\/(json|sql|manifest\+json)|image\/svg)/.test(type)) {
    const text = data.toString('utf8');
    for (const [pattern, label] of SECRET_CONTENT)
      if (pattern.test(text)) findings.push(`${path}: ${label}`);
  }
  return findings;
}

/** Permissions must live in the module's own namespace; no wildcards or reserved namespaces. */
export function permissionProblems(moduleId: string, permissions: readonly string[]): string[] {
  const problems: string[] = [];
  const pattern = new RegExp(`^${moduleId.replace(/-/g, '\\-')}(\\.[a-z][a-z0-9-]*){1,3}$`);
  for (const permission of permissions) {
    if (permission.includes('*')) problems.push(`wildcard permission: ${permission}`);
    else if (!pattern.test(permission))
      problems.push(`permission outside the module namespace "${moduleId}.": ${permission}`);
  }
  return problems;
}

const IDENT = '[a-z_][a-z0-9_]*';
export const moduleRole = (moduleId: string) => `kns_${moduleId.replace(/-/g, '_')}`;

/** Strip comments; refuse dollar-quoted bodies; replace string literals; split statements. */
export function sqlStatements(sql: string): { statements: string[]; problems: string[] } {
  const problems: string[] = [];
  if (/\$[a-zA-Z_]*\$/.test(sql))
    problems.push('dollar-quoted bodies (functions/DO blocks) are not allowed');
  const text = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"[^"]*"/g, (m) => {
      problems.push(`quoted identifier not allowed: ${m}`);
      return m;
    });
  const statements = text
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
  return { statements, problems };
}

/**
 * Additive-only migration allowlist inside the module's owned schemas: CREATE TABLE/INDEX/
 * SEQUENCE/TYPE, ALTER TABLE ... ADD, INSERT ... VALUES, COMMENT. Everything else (schemas,
 * grants, DROP, TRUNCATE, DELETE, UPDATE, RENAME, type changes, functions, roles, cross-schema
 * references) blocks the install. Static defense in depth: the restricted migrator login that
 * executes the SQL is the primary boundary (design §19).
 */
export function migrationProblems(
  moduleId: string,
  owned: readonly string[],
  sql: string,
): string[] {
  const { statements, problems } = sqlStatements(sql);
  const ownedSet = new Set(owned);
  const target = `(${IDENT})\\.(${IDENT})`;
  const allowed: Array<[RegExp, (m: RegExpMatchArray) => string[]]> = [
    [new RegExp(`^create table (?:if not exists )?${target} ?\\(.*\\)$`), (m) => [m[1]]],
    [
      new RegExp(
        `^create (?:unique )?index (?:if not exists )?(?:${IDENT} )?on ${target}(?: using ${IDENT})? ?\\(.*\\)(?: where .*)?$`,
      ),
      (m) => [m[1]],
    ],
    [new RegExp(`^create sequence (?:if not exists )?${target}(?: .*)?$`), (m) => [m[1]]],
    [new RegExp(`^create type ${target} as enum ?\\(.*\\)$`), (m) => [m[1]]],
    [
      new RegExp(
        `^alter table (?:if exists )?(?:only )?${target} (add (?:column |constraint )?.*)$`,
      ),
      (m) => [m[1]],
    ],
    [new RegExp(`^insert into ${target} ?(?:\\([^)]*\\) )?values .*$`), (m) => [m[1]]],
    [
      new RegExp(
        `^comment on (?:table|column|index|schema|sequence|type) ${target}(?:\\.${IDENT})? is ''$`,
      ),
      (m) => [m[1]],
    ],
    [new RegExp(`^comment on schema (${IDENT}) is ''$`), (m) => [m[1]]],
  ];
  const forbidden =
    /\b(drop|truncate|delete|update|rename|execute|copy|security definer|create role|alter role|create function|create procedure|create trigger|do|select|vacuum|cluster|reindex|set role|set session|reset|owner to|create extension|tablespace|create database|create policy|alter default privileges)\b/;
  for (const statement of statements) {
    const short = statement.slice(0, 120);
    // KNS provisions owned schemas and applies runtime privileges from contracts/database-access.json.
    if (/^create schema\b/.test(statement)) {
      problems.push(`owned schemas are provisioned by KNS; remove CREATE SCHEMA: ${short}`);
      continue;
    }
    if (/^(grant|revoke)\b/.test(statement)) {
      problems.push(
        `runtime privileges come from contracts/database-access.json, not SQL: ${short}`,
      );
      continue;
    }
    if (
      /^alter table/.test(statement) &&
      /\b(drop|rename|alter column|set data type|type )\b/.test(statement)
    ) {
      problems.push(`destructive ALTER: ${short}`);
      continue;
    }
    // Referential actions in additive DDL are not data operations.
    const scanned = statement.replace(
      /\bon (delete|update) (cascade|restrict|no action|set null|set default)\b/g,
      ' ',
    );
    const keyword = forbidden.exec(scanned);
    if (keyword) {
      problems.push(`forbidden operation "${keyword[1]}": ${short}`);
      continue;
    }
    const rule = allowed.find(([pattern]) => pattern.test(statement));
    if (!rule) {
      problems.push(`statement not in the additive allowlist: ${short}`);
      continue;
    }
    const schemas = rule[1](statement.match(rule[0])!);
    for (const schema of schemas)
      if (!ownedSet.has(schema))
        problems.push(`statement targets non-owned schema "${schema}": ${short}`);
    for (const ref of statement.matchAll(new RegExp(`references (${IDENT})\\.`, 'g')))
      if (!ownedSet.has(ref[1])) problems.push(`cross-domain foreign key to "${ref[1]}": ${short}`);
  }
  return problems;
}

/** Runtime ACL declaration: owned schemas only (object existence is checked at install). */
export function databaseAccessProblems(owned: readonly string[], access: KnsmodDatabaseAccess) {
  const problems: string[] = [];
  for (const schema of Object.keys(access.schemas))
    if (!owned.includes(schema))
      problems.push(`database-access.json grants on non-owned schema "${schema}"`);
  return problems;
}

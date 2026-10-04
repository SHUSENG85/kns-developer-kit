# KNS Module Package v1 (.knsmod)

**Specification (packageSpecVersion):** 1.0.0\
**Status:** IMPLEMENTED AND SANDBOX-PROVEN on branch (`@kns/contracts/knsmod`, `@kns/server-kit` `knsmod`, Core Module Manager) — not merged, not deployed\
**Governing blueprint:** KNS Master Architecture Blueprint v4.2

## 1. Purpose

`.knsmod` is the immutable release package format for independently developed KNS modules.
It is ZIP-based transport, but an arbitrary ZIP is never a valid KNS module.

The format packages reviewed build artifacts and contracts. It is not a mechanism for uploading a
source tree and running arbitrary install scripts.

Git remains source authority. A `.knsmod` is a release artifact.

## 2. Required top-level layout

```text
kns-<module-id>-<version>.knsmod
├── module.json
├── package-manifest.json
├── signature.json
├── contracts/
│   └── openapi.json              # Type B when HTTP API is exposed
├── frontend/                     # when frontend exists
│   ├── index.html
│   ├── build-info.json
│   └── assets/
├── api/                          # Type B
│   └── image.oci.tar
├── migrations/                   # when module owns durable schema
└── verification/
    └── release-evidence.json
```

Only files declared by the package manifest are allowed. Optional sections may be absent when the
module shape does not require them.

## 3. Sources of truth

`module.json` is the authoritative module/runtime contract. Do not create a second competing
module manifest.

`package-manifest.json` is only the package/artifact inventory and integrity/provenance record.

`signature.json` authenticates the canonical package manifest using a platform-trusted signing key.
Private signing keys are never packaged.

## 4. module.json minimum contract

It must declare at least:

- package spec version;
- module ID;
- module semantic version;
- module shape (Type A or Type B);
- source/release identity;
- frontend/API/health/version paths when applicable;
- required and optional capabilities with version ranges;
- requested permissions;
- owned data/schema boundary;
- migration set;
- required secret names/types only, never values;
- compatibility ranges;
- supported upgrade-from/rollback compatibility;
- artifact references.

Implemented schema: `KnsmodModuleSchema` in `packages/contracts/src/knsmod.ts`. It embeds the
Platform Contract v2 `ModuleV2Schema` unchanged as `module`, and adds:

- `shape`: `A` (immutable static frontend only) or `B` (API OCI image, optional frontend and
  migrations);
- `source.commit` (40-hex) and `source.releaseId`;
- `compatibility.platformContract`, which must equal `module.requiredPlatformContract`;
- `compatibility.upgradeFrom` and `compatibility.rollbackTo`: the installed versions this release
  may replace and roll back to without a database change;
- `artifacts`:
  - `frontend` (`frontend`);
  - `apiImage` (`api/image.oci.tar` plus its OCI manifest digest);
  - `openapi` (`contracts/openapi.json`);
  - ordered `migrations/NNNN_name.sql`;
  - `releaseEvidence`;
- `requiredSecrets`: identifiers and types only.

Data dependencies are expressed only as Contract v2 capabilities. There are no free-form Core or
Master version strings.

Package routes are fixed by the module ID: `/<id>/`, `/api/v1/<id>` and `/api/v1/<id>/health`.

## 5. package-manifest.json

The manifest must deterministically inventory every allowed package member except the detached
signature itself, with:

- normalized relative path;
- SHA-256;
- byte size;
- media/artifact type;
- package format version;
- module ID/version;
- build/source identity;
- creation metadata that does not contain secrets.

The validator recomputes every digest and rejects missing, extra or mismatched files.

Implementation:

- entries are sorted by UTF-8 byte order;
- the manifest is written with a fixed key order;
- it carries `tool` (the packer identity) instead of a timestamp.

Identical inputs therefore give an identical manifest.

## 6. signature.json

Checksums prove integrity, not publisher authenticity.

The signature record contains only public verification metadata such as algorithm, trusted key ID,
and signature over the canonical package manifest.

Trust roots are configured by KNS Core/operator policy. The package never supplies a private key or
self-authorizes an unknown signing key.

Implementation: Ed25519 (Node `crypto`).

- `signature.json` is `{algorithm: "ed25519", keyId, signedFile: "package-manifest.json",
  signedSha256, signature}`.
- The signature covers `KNSMOD-V1-SIGNATURE\n` followed by the exact `package-manifest.json`
  bytes.
- The operator trust store (`KnsmodTrustStoreSchema`) lists, for each key, its raw public key, the
  module IDs it may sign (no wildcard) and a `revoked` flag.
- A malformed trust store blocks validation. It never means "trust all".

## 7. Archive safety

Validation occurs before execution.

Reject:

- absolute paths;
- `..` path traversal;
- symlinks/hardlinks/device entries;
- duplicate normalized paths;
- case-colliding paths;
- encrypted archive members;
- unexpected files;
- excessive file count;
- excessive member size or total uncompressed size;
- suspicious compression ratios/zip bombs;
- malformed names/unsupported encodings.

Extraction occurs only into a quarantine workspace. No package code, migration or image is executed
during structural/integrity validation.

Implementation (`zip.ts`): the reader accepts only the subset the packer writes.

- **File layout:**
  - the end record must close the file, so no archive comments or trailing data;
  - member records must tile the file from offset 0 to the central directory, so no prepended,
    hidden or overlapping data.
- **Format features:** no ZIP64, data descriptors, encryption or unknown flags; STORE and DEFLATE
  only.
- **Member types:** regular files only; no symlinks, directories or devices.
- **Names:**
  - strict UTF-8 in NFC form;
  - no absolute or drive paths, backslashes, `.`/`..` or empty segments, reserved device names or
    unsafe characters;
  - no duplicates or case collisions.
- **Default limits:**

  | Limit | Value |
  |---|---|
  | Package size | 768 MiB |
  | Members | 2 000 |
  | Per-member size | 512 MiB |
  | Total uncompressed size | 1 GiB |
  | Compression ratio, members ≥ 1 MiB | 200:1 |

- **Inflation:** members are inflated in memory, bounded by their declared size and CRC-checked.
- **Allowed members:**
  - the four metadata files;
  - `contracts/openapi.json` and `api/image.oci.tar`;
  - `migrations/NNNN_name.sql`;
  - static `frontend/**` files of known media types.

The packer writes deterministically: sorted members, fixed 1980-01-01 timestamps, fixed permissions
and no extra fields. Ed25519 signatures are deterministic, so identical inputs and key give a
byte-identical package for the same zlib implementation.

## 8. Frontend artifact

Frontend output is immutable static build output. `build-info.json` records module/version/source
identity and must agree with `module.json`.

Routes are declared, collision-checked and activated by platform-owned routing logic. A package may
not provide arbitrary Caddy configuration.

## 9. API artifact

Type B packages use an immutable OCI image archive or a future explicitly approved artifact type.
The image digest must be declared and verified.

Runtime policy is platform-owned. A module must not require privileged containers, host networking,
Docker socket access, unrestricted host mounts or root-equivalent deployment privileges.

## 10. Migration artifact

Package v1 migrations are expand/additive by default and operate only inside the approved
module-owned database boundary.

Normal package installation must reject unapproved destructive operations or cross-owner schema
mutation. Migration rehearsal belongs to the controlled installation workflow.

Implementation (`policy.ts`): a statement allowlist applied only inside the module's
`ownedSchemas`.

- **Allowed:**
  - `CREATE SCHEMA`, `CREATE TABLE`, `CREATE INDEX`, `CREATE SEQUENCE`, `CREATE TYPE … AS ENUM`;
  - `ALTER TABLE … ADD`;
  - `INSERT … VALUES`;
  - `COMMENT ON`;
  - `GRANT` to the module runtime role `kns_<id>`;
  - referential actions such as `ON DELETE CASCADE` inside owned DDL.
- **Blocked:**
  - `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `RENAME`;
  - column type or nullability changes;
  - functions, procedures, triggers, `DO` and other dollar-quoted bodies;
  - roles;
  - `SELECT`, `COPY`, `EXECUTE`;
  - quoted identifiers and unqualified tables;
  - foreign keys into other schemas.

Rollback normally switches application artifacts to a compatible previous release; it does not
automatically reverse additive migrations.

## 11. Secrets and sensitive data

A package must never contain:

- passwords or `.env` secrets;
- service/API tokens;
- private signing/SSH keys;
- production databases/backups;
- session cookies;
- Cloudflare credentials;
- raw pupil IC datasets;
- real personal datasets used as fixtures.

A module declares required secret identifiers only. Values are provisioned server-side.

## 12. Validation result

Validation is fail-closed and produces a machine-readable report.

Minimum stages:

1. archive safety;
2. required structure;
3. package manifest schema;
4. file inventory/digests;
5. signature/trust;
6. module contract schema;
7. module ID/version consistency;
8. platform compatibility;
9. required/optional capability compatibility;
10. permission declaration review;
11. route conflict check;
12. artifact metadata/digest check;
13. migration policy/static safety checks;
14. release evidence check.

Any required-stage failure yields `INSTALL_BLOCKED`.

Implemented as `validatePackage`, with 15 stages (a secrets and personal-data scan is added). It
returns one of three results:

- **`VALIDATED`:** every stage passed against a Core-supplied platform context. The package is
  eligible for review.
- **`PACKAGE_VERIFIED`:** integrity, signature and static policy passed, but the platform-dependent
  stages were not evaluated: platform contract and upgrade, capabilities, and installed-route and
  schema conflicts. This is what developer `kns verify` returns without `--platform`. It is never
  an install approval.
- **`INSTALL_BLOCKED`:** any stage failed.

Developer commands:

```text
npm run kns -- keygen <key-id> <dir>
npm run kns -- pack <release-dir> --key <pem> --key-id <id> [--out <dir>]
npm run kns -- verify <file> --trust <trust.json> [--platform <context.json>] [--json]
```

Passing package validation means only that the package is eligible for controlled review/install.
It does not mean permissions are granted, the module is enabled, or production deployment succeeded.

## 13. Lifecycle separation

Keep these state domains separate:

- Package: UPLOADED, VALIDATING, VALIDATED, REVIEW_REQUIRED, READY, INSTALLING, INSTALLED, FAILED,
  QUARANTINED.
- Runtime module: DISABLED, ENABLED, MAINTENANCE.
- Release: STAGED, ACTIVE, ROLLED_BACK, FAILED.

Do not collapse them into one boolean such as `installed=true`.

## 14. Install/upgrade boundary

The future Module Manager may orchestrate reviewed immutable packages, but it must not become an
arbitrary code marketplace/executor.

Installation/upgrade is serialized per module and audited. Activation should be atomic after
migration, isolated startup and health checks.

Package v1 uninstall means disabling/removing runtime artifacts. Business-data purge is a separate,
explicitly reviewed operation.

### 14.1 Module Manager workflow (owner decisions 2026-10-03)

```text
.knsmod -> upload (Core, platform.modules.upload): streamed to quarantine/<sha256>.knsmod with a
           byte limit and an incremental SHA-256; recorded UPLOADED (Core never parses it)
        -> validate (operator, `npm run kns -- validate` or `process`): the file must still hash to
           the recorded digest; those bytes are validated against live state; VALIDATED (with the
           reviewer summary for that digest) or QUARANTINED
        -> review (Core, platform.modules.review): the decision names the digest shown and the
           quarantine file is re-hashed; APPROVED -> READY, REJECTED -> QUARANTINED
        -> request INSTALL | UPGRADE | ROLLBACK (Core, platform.modules.install|upgrade|rollback)
        -> operator executes (`npm run kns -- process`): re-hashes against the approved digest,
           re-validates, installs; containers start by the verified image ID
        -> enable / disable (Core, platform.modules.enable for package-managed modules)
```

Integrity chain: upload digest = validated digest = reviewed digest = approved digest = installed
bytes = loaded image ID. Any replacement of the quarantine file after upload is refused at review
or install.

| Layer | Holds | Never holds |
| --- | --- | --- |
| Core (kns_core) | quarantine directory (write, streaming), package/review/request rows, audit, runtime status | Docker, shell, host filesystem, release root, migration or superuser credentials, trust store, SQL parser, package contents in memory |
| Host-side operator (`scripts/knsmod/cli.ts`) | Docker CLI, migration credentials, release root, routes | browser sessions; it only executes recorded, authorised requests (and re-checks state) |
| Module containers | own runtime login, own service token | Docker socket, host mounts, other modules' schemas |

Migrations: `042` (packages, releases, operations), `043` (module migration ledger, migrators,
`module_ledger.record_module_migration`), `044` (review fields, upload size, reviewer summary,
operation requests, audit vocabulary).
Package states: `UPLOADED` (awaiting operator validation), `VALIDATED` (awaiting review), `READY` (approved), `INSTALLING`, `INSTALLED`,
`QUARANTINED` (blocked or rejected), `FAILED`. A version is immutable: the same version with a
different digest is always rejected.

Core memory: Core runs with 256 MiB. Uploads are streamed (default limit 256 MiB on disk,
`MODULE_UPLOAD_LIMIT_MB`); measured Node RSS growth while streaming is ~50-66 MiB for 100 MiB to
1 GiB (bounded by garbage collection, not by size). Package parsing and inflation happen only in
the host-side operator. Core imports the SQL parser lazily and never loads it.

Permissions: only `ENABLED` modules contribute permissions; uploaded, validated, approved, installed
or disabled packages grant nothing (tests: `tests/module-manager.test.ts`).

### 14.2 Installer (host-side operator)

`@kns/server-kit` `knsmod.installPackage / activateRelease / processRequests / setRuntimeStatus / apiHealth`.

| Step | Effect | Never does |
| --- | --- | --- |
| install | only a `READY` package from quarantine; re-verifies digest and re-validates against live state (else back to `QUARANTINED`); stages the immutable release; `docker load`, image ID must equal the package's OCI digest, tagged `kns-mod-<id>:<version>` | register, provision roles, start containers, run package code or SQL, accept package-supplied Caddy, Compose or scripts |
| activate | provisions `kns_<id>` (no login), `<id>_login`, `<id>_migrator` (owns the declared schemas; login only while migrating); runs pending `migrations/NNNN_*.sql` over the migrator login, each with its `platform.module_migrations` row in one transaction; sets the runtime ACL to exactly `contracts/database-access.json` and verifies it; starts the container (non-root, read-only, `cap-drop ALL`, `no-new-privileges`, bounded memory/pids, no ports or mounts); switches the generated route and reloads the gateway only after health reports the new version; registers the module (`DISABLED` when new); retires the previous container | grant permissions, enable the module |
| rollback | target must be in the active release's `rollbackTo`; same health-gated switch; ACL returns to the target's declaration | run or reverse migrations (no database rollback) |
| failure | route, `current/` link, new container and ACL are restored; operation recorded `FAILED` | leave traffic on an unhealthy release |

Every step takes a per-module PostgreSQL advisory lock and is recorded in
`platform.module_operations`. Not installable yet: packages that provide capabilities or require
operator-provisioned secrets.

### 14.3 Migration SQL policy

Each migration must pass both layers; either failing blocks the package:

1. `libpg-query` 18.1.5 (PostgreSQL 18 grammar, WASM, pinned): only `CREATE TABLE`, `CREATE INDEX`
   (not `CONCURRENTLY`), `CREATE SEQUENCE`, `CREATE TYPE … AS ENUM`, `ALTER TABLE … ADD COLUMN /
   ADD CONSTRAINT`, `INSERT … VALUES` (optionally `ON CONFLICT DO NOTHING`) and `COMMENT`; every
   relation, type, foreign key and comment target must be schema-qualified inside `ownedSchemas`;
   functions only from a small allowlist (`now`, `gen_random_uuid`, `lower`, `upper`, `length`,
   `char_length`, `btrim`, `abs`); no subqueries, CTEs, `LIKE`, inheritance, partitions, temporary
   or unlogged tables, tablespaces. Unparseable, empty or unrecognised SQL fails closed.
2. The independent textual allowlist (no dollar quoting or quoted identifiers).

The restricted migrator login remains the enforcement boundary.

## 15. Implementation proof status

| Item | State |
| --- | --- |
| JSON Schemas (module/package/signature/evidence/trust store/database access) | IMPLEMENTED, TESTED |
| Deterministic packer, `kns pack` / `kns verify` | IMPLEMENTED, TESTED |
| Fail-closed validator, malicious archive corpus | IMPLEMENTED, TESTED |
| Ed25519 signing, module-scoped trust store | IMPLEMENTED, TESTED |
| Frontend-only (shape A) packages | REFUSED by owner decision; historical sandbox evidence only |
| API packages (shape B): installer, restricted migrator, ledger, declared ACL | IMPLEMENTED, TESTED, SANDBOX-PROVEN |
| PostgreSQL-grammar migration checks + adversarial corpus | IMPLEMENTED, TESTED |
| ENABLED-only permission lifecycle (Core) | IMPLEMENTED, TESTED, SANDBOX-PROVEN |
| Module Manager API (Core) and UI (Staff) | IMPLEMENTED, TESTED, SANDBOX-PROVEN (API); UI tested by rendering |
| upload -> quarantine -> validate -> review -> install -> enable -> upgrade -> rollback | SANDBOX-PROVEN on the KNS host ([record](../verification/2026-10-03-knsmod-lifecycle-proof-host.md)); not deployed |
| Capability-providing packages, operator-provisioned secrets | NOT IMPLEMENTED (refused at install) |

Production deployment plan: `docs/handoff/knsmod-production-deployment-plan.md` (not executed).

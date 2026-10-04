# KNS Module Developer Pack v1

**Pack version:** 1.0.0\
**Status:** RELEASED — third-party developer/agent bootstrap contract; not a production deployment procedure\
**Governing blueprint:** KNS Master Architecture Blueprint v4.2

This is the stable entrypoint given to an independent KNS module developer or coding agent.
It does not replace the governing architecture. It tells the agent what to read, what it may own,
what it must not invent, and what evidence is required before a module can be packaged.


## 0. Who this file is for

This file is intentionally written so that a developer who has never worked on KNS can start safely with a coding agent. The developer is not expected to learn the whole KNS codebase before beginning. The agent uses this file as its bootstrap, discovers the authoritative KNS contracts below, and stops rather than guesses when a required contract is unavailable.

### Minimum input from the module developer

The developer needs only:

1. this Developer Pack, preferably the current copy from the authoritative repository;
2. access to the KNS source/contracts referenced by this Pack, or a KNS-provided contract bundle containing them;
3. a short description of the intended school workflow/module;
4. a coding agent capable of reading the repository and running the required build/test tools.

Production credentials, production databases and real pupil/staff datasets are not development prerequisites.

### Bootstrap prompt for an unfamiliar developer

Give the coding agent this Pack and the following instruction, replacing the module description:

~~~text
Read KNS-MODULE-DEVELOPER-PACK-v1.md completely before changing code.

You are developing a third-party module for KNS. Assume I do not know KNS internals.
Use the Developer Pack to discover and follow the authoritative architecture, contracts,
capabilities, security rules, UI system and .knsmod packaging rules.

Module idea: <describe the real school workflow here>

Do not modify KNS Core or Master Data for convenience.
Do not duplicate canonical KNS data.
Do not invent APIs, capabilities, permissions, manifest fields or package formats.
If you cannot prove that a required KNS contract/capability exists, treat it as unavailable
and stop with a concrete dependency report.

Start with the design gates. Do not implement until the module design is approved.
After approval, create a bounded implementation work order, implement and verify it, then
produce a valid installable kns-<module-id>-<version>.knsmod and the handoff evidence required
by this Pack.
~~~

### First response expected from the agent

Before writing implementation code, the agent must report:

- the Pack version it is using;
- the exact governing blueprint and module guide it found;
- the executable module/package contract locations it found;
- the available KNS SDK/server-kit/UI integration surfaces relevant to the proposed module;
- what it knows and does not yet know about the real school workflow;
- any missing required contract/capability;
- the questions or owner decisions required to complete the design gates.

If the agent starts scaffolding tables/pages before doing this, it is not following this Pack.

## 1. Agent start rule

Before changing code:

1. read this file completely;
2. fetch the current copy of this file from the authoritative KNS repository;
3. compare `Pack version`;
4. read the current governing sources listed below;
5. inspect the current platform contracts/SDK/UI package actually present in the target repository;
6. report incompatible or missing required capabilities instead of inventing them;
7. complete the design gates before implementation.

A stale Developer Pack is not by itself proof that an existing module is runtime-incompatible.
Runtime compatibility is determined by declared platform/capability/package contracts.

## 2. Architecture authority

Use this order:

1. `platform/docs/blueprint/v4.2-master-blueprint.md`;
2. current architecture documentation;
3. `platform/docs/handoff/module-guide.md`;
4. module-specific approved design documents.

Use the current repository state as implementation truth. Do not infer deployed production state
from source code alone.

## 2.1 Contract discovery rule

Repository paths in this Pack are discovery pointers, not permission to invent missing interfaces. The executable schema and generated contract in the current authoritative source win over prose examples when they are compatible with the governing architecture.

For a full KNS repository checkout, verify at minimum that these inputs exist before implementation:

~~~text
platform/docs/blueprint/v4.2-master-blueprint.md
platform/docs/handoff/module-guide.md
platform/docs/architecture/kns-module-package-v1.md
platform/packages/contracts
platform/packages/sdk
platform/packages/server-kit
platform/packages/ui
~~~

For a deliberately limited third-party contract bundle, the KNS owner must provide equivalent versioned contract/SDK/UI inputs. The agent must identify what is absent and must not reconstruct a missing API from examples, legacy code, database schema or guesses.

**Fail-closed rule:** if you cannot prove a required KNS contract or capability exists, treat it as unavailable. Never invent it.

## 3. Required platform inputs

A developer/agent must use, when applicable:

- `platform/packages/contracts` — platform/module contracts;
- `platform/packages/sdk` — supported platform client integration;
- `platform/packages/server-kit` — supported server-side integration;
- `platform/packages/ui` — shared KNS UI system;
- published OpenAPI/capability contracts;
- synthetic/non-sensitive test fixtures.

Never require production passwords, private keys, service tokens, session cookies, raw pupil IC
datasets or production database copies for ordinary module development.

## 4. Ownership rules

Core owns shared identity, authentication, sessions, authorization, module registry, capability
registry and platform capabilities.

Master Data owns canonical staff, pupils, classes, enrolments, academic structures, identity links,
class-teacher assignments, teaching assignments and other designated school master data.

A business module owns only records unique to its business workflow. It references canonical IDs and
must not create a second canonical authority.

Cross-domain access uses stable contracts/capabilities, never direct SQL joins into another owner's
schema or imports of another app's internal implementation.

## 5. Design gates

Before implementation, follow the canonical module guide and produce an approved design covering:

- real school workflow;
- module boundary and explicit exclusions;
- data ownership;
- Core/Master/other-module dependencies;
- required and optional capabilities;
- permissions;
- API/service contracts;
- schema;
- UI workflow using KNS UI;
- lifecycle/state transitions;
- audit/events;
- degraded behaviour;
- idempotency/concurrency;
- edge cases;
- migration behaviour;
- rollback compatibility;
- unresolved owner decisions.

Do not implement unresolved school-policy decisions by guessing.

## 6. Implementation rules

A module must be independently buildable, testable, versioned and releasable.

It must not:

- modify Core/Master merely for convenience;
- duplicate canonical Master Data;
- create its own login/password/session authority;
- use wildcard/generic administrator permissions;
- depend on another module's private tables or source internals;
- embed production secrets;
- assume an optional capability exists;
- claim production deployment without production evidence.

Required capability absence fails explicitly and safely. Optional capability absence must have a
documented degraded path.

## 7. Permission rule

Permissions are explicit and least-privilege. UI visibility is not authorization. The owning API
must enforce actor/resource authority.

A module package may declare/request permissions. Installation or registration must not silently
grant those permissions to roles or users.

## 8. Database and migration rule

Module-owned durable data belongs to the module's approved schema/ownership boundary.

For KNS Module Package v1, packaged migrations must be additive/expand-compatible. Destructive data
removal is outside the normal package install/upgrade path.

Application rollback does not imply database rollback. A previous supported release must remain
compatible with schema changes introduced by a normal v1 upgrade.

A v1 external package **must include an API** (Platform Contract v2); a frontend is optional.
Frontend-only packages are refused until a future contract version supports them.

Package migrations (design §§18–22; checked with the PostgreSQL 18 grammar, see the package spec
§14.3 for the exact allowlist):

- module-local names `migrations/0001_name.sql`, `0002_…`; never renumber or edit an applied file
  (a changed checksum blocks activation);
- schema-qualified objects in your `ownedSchemas` only; KNS creates those schemas — do not
  `CREATE SCHEMA`;
- no `GRANT`/`REVOKE`: declare runtime privileges in `contracts/database-access.json`
  (`SELECT`/`INSERT`/`UPDATE`/`DELETE` per table, `USAGE`/`SELECT` per sequence); KNS applies
  exactly that to `kns_<id>` and verifies it;
- only additive statements: `CREATE TABLE/INDEX/SEQUENCE`, `CREATE TYPE … AS ENUM`,
  `ALTER TABLE … ADD COLUMN/CONSTRAINT`, `INSERT … VALUES`, `COMMENT`; no functions except
  `now`, `gen_random_uuid`, `lower`, `upper`, `length`, `char_length`, `btrim`, `abs`;
- SQL runs as a restricted migrator login that owns only your schemas.

Type B runtime contract: the API listens on `PORT` (KNS sets 8080) and `HOST`; it reads its database
login from `DATABASE_URL` and its Core service token from `<ID>_SERVICE_TOKEN`; the root filesystem
is read-only (`/tmp` is writable); `GET <apiBasePath>/health` returns
`{"data":{"status":"ok","version":"<release version>"}}`. KNS switches traffic only after that
health check reports the new version.

The container environment is exactly: `PORT`, `HOST`, `NODE_ENV`, `KNS_MODULE_ID`, `KNS_RELEASE`,
`DATABASE_URL` and `<ID>_SERVICE_TOKEN` (both generated per module; `<ID>` is the module ID
upper-cased with `-` replaced by `_`, so `hello` receives `HELLO_SERVICE_TOKEN`), plus
operator-supplied module settings such as `IDENTITY_URL` (the Core identity base URL). Do not read a
generic `SERVICE_TOKEN` and do not rely on any other variable. The health version must be the version
packaged in `module.json`. A module that owns no schema (`ownedSchemas: []`) still receives
`DATABASE_URL` and should ignore it.

## 9. Testing and release evidence

Before packaging, run:

- focused module tests;
- contract/manifest validation;
- permission/authorization tests;
- migration tests where applicable;
- health/version endpoint tests for Type B modules;
- production build;
- relevant platform invariant tests.

Record exact commands and results. Failed required verification means the package is not releasable.

## 10. Packaging output

The release output is one immutable file:

`kns-<module-id>-<semver>.knsmod`

It must conform to `platform/docs/architecture/kns-module-package-v1.md`.

Release input directory (packer input):

```text
module.json                          # shape, Contract v2 module, source, compatibility, artifacts
verification/release-evidence.json   # exact commands and PASS results
frontend/...                         # build output incl. index.html and build-info.json
api/image.oci.tar                    # shape B: `docker save` OCI image, non-root user, labels
contracts/openapi.json               # shape B
contracts/database-access.json       # required with migrations: runtime privileges
migrations/NNNN_name.sql             # additive, owned schema only
```

Commands:

```text
npm run kns -- keygen <key-id> <dir-outside-the-repository> [--module <module-id>]
npm run kns -- pack <release-dir> --key <private.pem> --key-id <key-id> --out <dir>
npm run kns -- verify kns-<id>-<version>.knsmod --trust <trust-store.json>
```

`pack` refuses:

- unexpected files;
- secrets and personal-data patterns;
- a signing key located inside the release input.

It then self-verifies the package. Give the KNS operator only the public trust-store entry that
`keygen` prints.

`keygen --module <module-id>` also writes `<key-id>.trust-store.json` (public data only) so you can
run the offline `verify` against your own key. `pack` creates the output directory.

`examples/hello-kns` is a complete worked reference: `npm ci`, `npm test`, `npm run example:build`
(real frontend build, real `linux/amd64` non-root API OCI image, a `module.json` carrying the real
`artifacts.apiImage.manifestDigest`, and release evidence of the commands that actually ran), then
`keygen`, `pack` and `verify`. Its `README.md` is the step-by-step recipe.

Source ZIPs, repository checkouts and arbitrary ZIP files are not installable KNS module packages.

## 10.1 Third-party release workflow

A third-party developer does not install directly into production. The expected handoff boundary is:

~~~text
school workflow idea
  -> approved module design
  -> bounded implementation
  -> source verification
  -> immutable signed .knsmod
  -> developer handoff
  -> KNS Module Manager validation/review
  -> operator-controlled install/enable
~~~

A locally passing package is not permission to install it. `kns verify` without platform context proves package integrity and static policy only (`PACKAGE_VERIFIED`); KNS Module Manager performs platform-dependent validation before review/install.

## 11. Agent final handoff

Return:

- module ID and version;
- source commit/release identity;
- approved design reference;
- declared dependencies/capabilities;
- requested permissions;
- verification results;
- package filename;
- package SHA-256;
- known limitations/degraded paths;
- rollback-compatible previous versions;
- unresolved production/operator actions.

Do not include secrets or personal datasets.

## 11.1 Third-party readiness checklist

Before handing the package to the KNS owner, all answers must be YES:

- Was the real school workflow approved before implementation?
- Is every durable dataset assigned to exactly one owner?
- Are canonical staff/pupil/class/enrolment/identity records referenced rather than duplicated?
- Are all required/optional capabilities proven from current KNS contracts?
- Are permissions explicit and enforced by the owning API rather than only hidden in UI?
- Does the module use the shared KNS UI system when it has a frontend?
- Are migrations additive, module-owned and compatible with application rollback?
- Does the API satisfy the current Type B runtime/health contract?
- Did required tests/build/contract/package verification pass?
- Is the final artifact a signed immutable `.knsmod`, not a source ZIP?
- Does the handoff contain no secrets or real personal datasets?
- Are unresolved production/operator actions stated rather than silently performed?

Any NO means the module is not ready for KNS owner review.

## 12. Stop conditions

Stop and report a blocker when:

- architecture authorities conflict materially;
- a required platform capability/contract does not exist;
- data ownership is unresolved;
- a school-policy decision is unresolved and changes behaviour;
- the requested implementation would weaken Core/Master authority;
- required verification fails;
- packaging would require unreviewed arbitrary code execution or production secrets.

The agent may propose a bounded architecture/design change, but must not silently bypass the blocker.

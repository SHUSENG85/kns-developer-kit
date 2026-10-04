# KNS Independent Module Development SOP

Status: **CANONICAL END-TO-END MODULE DEVELOPMENT PROCESS**

This file is the single operational guide for designing, building, reviewing, releasing,
rolling back and handing off an independently developed KNS module.

It does not replace higher architecture authority. When rules conflict, use this order:

1. KNS Master Blueprint v4.3;
2. current architecture documentation;
3. this module guide;
4. module-specific approved design documents.

Blueprint v4.2 is the predecessor; v4.1 remains a historical implementation-validated baseline.

Blueprint v4.3 governs data capability readiness. The public Developer Kit distributes reviewed
catalog entries and callable contracts derived from accepted provider contracts. Consumers must
prove both the capability ID/version and the operation they need before implementation, declare
the dependency, and use the owning domain API for canonical data. Source workbooks, legacy data,
consumer caches and another domain's database cannot become canonical authority.

Core grants and enforces permissions separately from capability discovery and installation.
Provider health, data proof and authorization are separate checks. Fail closed on missing
contracts, unproven data, ambiguity or conflict; never infer availability from absent lessons.
The private Data Capability Readiness Registry supports owner diagnosis and planning; it is not
a runtime consumer API. Public contract availability proves distribution, not production
deployment, populated canonical data or runtime permission grants.

A KNS module is accepted only when it has a clear boundary, declared ownership, tested contracts,
versioned artifacts, health checks, rollback, production evidence and a clean handoff.
"It runs on my machine" is never acceptance.

---

# 1. What "independent module" means in KNS

An independent KNS module has its own:

- business boundary;
- source boundary;
- data ownership;
- manifest;
- permissions;
- API contract when needed;
- frontend artifact when needed;
- schema when it owns durable data;
- tests;
- version;
- deployment;
- rollback.

It still uses the shared platform for:

- Core identity, authentication and authorization;
- Master canonical staff, pupils, classes, enrolments, subjects and teaching assignments;
- KNS SDK;
- KNS UI system;
- platform capability catalog;
- common deployment and release conventions.

Independent does **not** mean duplicating Core or Master.

A module must never create a second canonical source for staff, pupils, classes, enrolments,
subjects, identity or platform permissions.

---

# 2. End-to-end lifecycle

Every module follows this lifecycle:

```text
Real school workflow
        ↓
Module Charter
        ↓
Boundary + Data Ownership
        ↓
Core / Master / Module Dependencies
        ↓
Permissions
        ↓
API + Schema + UI + Edge Cases
        ↓
Approved Module Design
        ↓
Bounded Source Implementation Issue
        ↓
Independent Branch Development
        ↓
Focused + Full Verification
        ↓
Implementation PR Review
        ↓
Merge
        ↓
────────────────────────────
SOURCE COMPLETE / NOT DEPLOYED
────────────────────────────
        ↓
Separate Production Work Order
        ↓
Backup / Migration / Recovery Rehearsal
        ↓
Immutable API / Frontend Artifacts
        ↓
Deploy Only This Module
        ↓
Smoke + Platform Invariants
        ↓
Record Deployment
        ↓
Evidence PR + Handoff
```

Source implementation and production deployment are separate gates.

A source implementation issue must never silently become a production deployment issue.

A production deployment requires its own bounded production work order.

Once a bounded work order exists, execution follows the standing owner instructions in
`AGENT-EXECUTION.md`: continue automatically unless the owner explicitly says STOP or a concrete
fail-closed blocker is encountered.

---

# 3. Phase A — understand the real school workflow first

Do not start from tables, pages or code.

Write down the actual school workflow:

- who starts the process;
- who participates;
- what data they need;
- what decisions are made;
- which actions must be recorded;
- what the final output is;
- who can correct or reverse an action;
- what happens when information is missing;
- what must remain historically auditable.

Ask whether the workflow already belongs to Core, Master or an existing module.

Do not create a new module merely because a new page is needed.

Typical output:

```text
Actor:
Trigger:
Inputs:
Steps:
Decision points:
Outputs:
Exceptions:
Audit evidence:
```

Legacy E-SYS/eRPH/old spreadsheets may be used only as workflow or migration references.
Legacy architecture is not the KNS target architecture.

Keep legacy-data migration separate from new-module design.

---

# 4. Phase B — create the Module Charter

No approved charter means no module implementation.

The charter must define:

## 4.1 Module ID

Use:

```regex
^[a-z][a-z0-9-]{1,39}$
```

Example:

```text
activity
exam
workflow
documents
analytics
```

The ID fixes the conventional paths:

```text
Frontend: /<id>/
API:      /api/v1/<id>/*
Health:   /api/v1/<id>/health
Version:  /api/v1/<id>/version
```

## 4.2 Module shape

Choose one.

### Type A — frontend only

Type A remains an architectural module shape for built-in/platform-managed modules that own no
durable business data, perform no server-side processing and only orchestrate existing KNS APIs.

**KNS Module Package v1 does not accept Type A external packages.** A third-party module intended
for installation through Module Manager as a `.knsmod` must use Type B and include the required API
artifact, even when its business workflow is otherwise frontend-heavy. Do not design an external
installable v1 package as Type A and assume packaging will add an API later.

### Type B — frontend + own API

Use when the module:

- owns durable business data;
- owns a workflow state;
- performs server-side processing;
- produces events;
- requires its own security/resource checks.

Do not create an API only because it is convenient.

## 4.3 Explicit exclusions

Every charter must also state what the module does **not** own or implement.

This prevents scope drift.

---

# 5. Phase C — define data ownership

Use the owner of record, not the UI location, to decide ownership.

## Core owns

- users;
- authentication;
- sessions;
- roles;
- permissions;
- module registry;
- capability registry;
- feature flags and platform capabilities.

Business modules must not create their own login/password/session tables.

## Master owns canonical school data

Including:

- staff;
- pupils/students;
- classes;
- enrolments;
- academic years;
- subjects;
- identity links;
- class-teacher assignments;
- teaching assignments;
- other canonical school master data.

Business modules reference canonical Master IDs.

They must not create duplicate canonical tables such as:

```text
module_staff
module_students
module_classes
module_subjects
```

for authority.

Display caches, denormalized snapshots or historical evidence are allowed only when an approved
design explicitly requires them and clearly states they are not canonical authority.

## Business module owns

Only the business records unique to its workflow.

Examples:

```text
activity.activity_sessions
workflow.requests
documents.files
exam.exams
exam.responsibility_revisions
```

A UI may combine several domains without transferring ownership.

---

# 6. Phase D — define dependencies

A module accesses another domain only through stable API/capability contracts.

Never use direct SQL joins across module owners.

Never import another app's internal source files.

Dependencies belong in the Platform Contract v2 manifest.

Use:

- `requiredCapabilities` when the module cannot perform its core operation without the dependency;
- `optionalCapabilities` when the module can provide a safe degraded path.

Example:

```ts
requiredCapabilities: [
  { id: 'master.pupil-enrolments', versionRange: '^1.0.0' }
]

optionalCapabilities: [
  { id: 'master.staff-directory', versionRange: '^1.0.0' }
]
```

A required dependency must be valid at install/startup/runtime as defined by the module.

An optional dependency must have an operation-specific degraded behavior.

Module ENABLED status does not mean a capability is AVAILABLE.

Capability availability also never grants authorization.

---

# 7. Phase E — define permissions

Permissions use:

```text
<domain>.<object>.<action>
```

Examples:

```text
activity.read
activity.manage
activity.attendance.write
exam.configure
exam.marks.write
```

Rules:

- no wildcard permissions;
- no generic `admin.*`;
- no "admin means everything";
- sensitive operations get distinct permissions;
- resource/object authority must still be checked by the owning API.

A visible UI button is not authorization.

Core refuses undeclared module permissions.

Do not change Core role mappings unless the approved design proves a new permission requires it.

---

# 8. Phase F — write the approved module design

Do not create the implementation issue until the design is clear.

Create:

```text
platform/docs/design/<module>-target-design.md
```

or a bounded slice design when the module is already established:

```text
platform/docs/design/<module>-slice-<n>.md
```

The design must include:

1. real school workflow;
2. module boundary;
3. data ownership;
4. Core dependencies;
5. Master dependencies;
6. other module dependencies;
7. required/optional capabilities;
8. permissions;
9. API/service contracts;
10. schema;
11. UI workflow;
12. lifecycle/state transitions;
13. idempotency/concurrency;
14. audit/event requirements;
15. degraded behavior;
16. edge cases;
17. migration behavior;
18. rollback compatibility;
19. explicit exclusions;
20. unresolved owner decisions.

Do not implement unresolved school-policy decisions by guessing.

---

# 9. Standard source layout

For a Type B module:

| Path | Purpose |
|---|---|
| `apps/<id>-api/` | API app, repository/domain code, `main.ts`, package |
| `apps/<id>-web/` | independent frontend |
| `database/migrations/NNN_<id>_*.sql` | additive schema/grants |
| `packages/contracts/src/index.ts` | module manifest and shared event schemas |
| `tests/<id>-*.test.ts` | focused module tests |
| `infra/modules/<id>.compose.yml` | independent API service |
| `infra/modules/<id>.caddy` | module routes |
| `infra/modules/<id>.smoke.sh` | module smoke |

Type A normally needs only the frontend, manifest/dependency integration and tests required by its
approved design.

Allowed shared imports:

```text
@kns/contracts
@kns/sdk
@kns/ui
@kns/server-kit
```

Never import another app's source files.

Browser code must not import:

```text
pg
fastify
node:*
@kns/server-kit
```

`npm run check` enforces boundaries.

---

# 10. Platform Contract v2 manifest

Every new module uses Platform Contract v2.

The manifest declares:

- `id`;
- `name`;
- `version`;
- `owner`;
- `frontendBasePath`;
- `apiBasePath`;
- `healthPath`;
- `permissions`;
- `ownedSchemas`;
- `eventsProduced`;
- `eventsConsumed`;
- `providesCapabilities`;
- `requiredCapabilities`;
- `optionalCapabilities`;
- `requiredPlatformContract: '2'`;
- `rollback: 'previous-release'`.

A provided capability declares:

- stable capability ID;
- semantic version;
- owner;
- description;
- sensitivity;
- OpenAPI contract reference;
- permissions;
- related events where relevant.

Never hand-edit generated OpenAPI or manifest outputs.

Use the repository generation command.

---

# 11. Database rules

One module owns only its approved schema(s).

Migrations are:

- numbered;
- forward-only;
- checksum-locked;
- additive by default.

Never edit an applied migration.

Destructive changes such as:

- DROP;
- RENAME;
- destructive type change;
- TRUNCATE;

require a separate reviewed migration plan.

Create a runtime role:

```text
kns_<module-id>
```

with minimum table-level grants.

Rules:

- UUID primary keys;
- never use name/email/IC as business identity;
- history tables should be append-only;
- history tables normally get no DELETE;
- audit tables are INSERT-only;
- external/legacy IDs belong in explicit mapping tables with provenance;
- do not enforce uniqueness a real school cannot guarantee.

A production rollback normally rolls back code, not an additive migration.

Therefore old code compatibility with the new schema must be rehearsed before production migration.

---

# 12. API rules

Use:

```ts
createApp(name, logging)
```

and:

```ts
route(operationId, owner, permission, responseSchema, bodySchema?, mutation?)
```

Every route must have strict TypeBox schemas for:

- params;
- query;
- body;
- response.

Unknown fields are rejected.

Authentication:

```ts
identityClient(IDENTITY_URL, SERVICE_TOKEN)
```

Every handler calls:

```ts
authenticate(req, permission)
```

Writes call:

```ts
authenticate(req, permission, true)
```

which enforces authentication, Origin and CSRF.

Never:

- read identity tables directly;
- parse trusted authority from cookie contents;
- handle passwords inside a business module.

Response format:

```json
{"data": {}}
```

Errors:

```json
{"error":{"code":"STABLE_CODE","message":"Safe message","requestId":"..."}}
```

Do not put sensitive personal data in error messages or logs.

Lists use cursor pagination, normally limit 1–100.

Retryable writes use actor-scoped idempotency.

Same key + same payload returns the committed result.

Same key + changed payload returns 409.

A business change, its audit row and required outbox event commit in one transaction.

Do not hold a database transaction/row lock while waiting on another module's HTTP call.

Cross-module validation should normally happen before the local write transaction, followed by
local version/idempotency rechecks inside the transaction.

Provide:

```text
GET /api/v1/<id>/health
GET /api/v1/<id>/version
```

Calendar dates remain `YYYY-MM-DD` strings.

---

# 13. Frontend rules

Use:

```ts
createSdk()
```

from `@kns/sdk`.

The SDK:

- stays same-origin;
- keeps CSRF in memory;
- never automatically retries a mutation.

Use:

```text
@kns/ui
@kns/ui/styles.css
```

and the shared design system.

Do not duplicate global UI styles or introduce arbitrary hex colors where shared tokens exist.

Mobile-first requirement:

- normal teacher tasks work at 375px;
- clear loading state;
- clear empty state;
- clear failure state;
- accessible labels;
- controls suitable for touch;
- no required horizontal scrolling for normal workflows.

Frontend build:

```text
dist/<id>/
```

Immutable assets:

```text
/<id>/_releases/<version>/
```

Use:

```ts
frontendConfig('<id>', '/<id>/', ...)
```

which creates `build-info.json`.

Product text is English or Bahasa Malaysia unless an approved module design says otherwise.

---

# 14. Events and asynchronous work

If a module consumes another module's events:

- declare them in `eventsConsumed`;
- use the KNS event feed;
- store cursor/receipts in the consuming module's own schema;
- handle at-least-once delivery;
- make replay harmless.

Do not create another broker/queue without a separately approved architecture change.

If a module publishes events:

- declare them in `eventsProduced`;
- commit business row + audit + outbox atomically;
- publish only stable event contracts.

---

# 15. Phase G — create the bounded implementation work order

After the design is approved, create one source implementation Issue.

It must state:

- exact repository;
- exact base SHA;
- target branch;
- design file;
- allowed files;
- expected migrations;
- permissions;
- capability changes;
- required tests;
- forbidden files;
- explicit exclusions;
- final verification commands;
- `DEPLOYED: NO`.

Typical branch:

```text
codex/<module>-<slice>
```

The implementation agent must not decide new architecture or school policy.

If the implementation discovers a real design gap, stop that slice and update the design first.

---

# 16. Phase H — independent source development

Before editing:

```bash
git fetch origin
git status
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git diff <locked-base>..origin/main
```

Re-read live GitHub `main`.

Do not assume a local checkout is current.

The implementation branch must contain only work allowed by the work order.

Do not mix:

- unrelated refactors;
- production configuration;
- data migration from legacy;
- secrets;
- host-specific files.

Local/source authority rule:

- GitHub `main` = formal source/document authority;
- local checkout = development workspace;
- production server = runtime truth;
- private `.local`/credentials/backups remain outside Git.

---

# 17. Tests required before implementation PR

Use synthetic data only.

Real PostgreSQL tests use:

```text
tests/helpers/database.ts
```

At minimum verify applicable cases:

1. anonymous -> 401;
2. missing permission -> 403;
3. missing/wrong CSRF -> 403;
4. foreign Origin -> 403;
5. object/resource scope;
6. runtime role cannot read another owner's tables;
7. runtime role cannot read `identity.*`;
8. history cannot be deleted;
9. exact idempotent replay;
10. changed-payload replay -> 409;
11. transaction atomicity;
12. pagination boundaries;
13. malformed input -> 400;
14. disabled module -> fail closed;
15. sensitive fields absent from lists/errors/logs;
16. dependency unavailable behavior;
17. old-code compatibility with additive schema where relevant;
18. mobile/accessibility behavior for frontend workflows.

Module-specific design adds further focused tests.

---

# 18. Full source verification gate

From `platform/`:

```bash
npm ci --ignore-scripts
npm run check
npm run openapi
git diff -- docs/api
npm test
npm run test:integration
npm run build
```

Run the focused module tests explicitly as well.

From repository root:

```bash
npm ci
npm test
npm run server:test
npm run build
git diff --check
git status --short
git rev-parse HEAD
```

Requirements:

- focused tests pass;
- platform tests pass;
- integration passes;
- root tests pass;
- server tests pass;
- type/boundary check passes;
- builds pass;
- generated API diff is expected only;
- applied migrations unchanged;
- working tree clean.

Never claim a command that was not actually run.

Record preliminary failures and fixes honestly.

---

# 19. Phase I — implementation PR

Open a PR to current reviewed `main`.

PR description must include:

- exact base SHA;
- final HEAD;
- exact changed-file list;
- architecture boundary;
- data ownership;
- permissions;
- capability changes;
- migration changes;
- focused test counts;
- full test counts;
- build/check results;
- generated API diff result;
- preliminary failures and fixes;
- explicit exclusions;
- `MERGED: NO`;
- `DEPLOYED: NO`.

Independent review checks:

- no cross-domain SQL;
- no Master duplication;
- no Core auth duplication;
- permissions not broadened;
- migration is forward/additive;
- API resource checks exist;
- optional dependencies degrade safely;
- diff remains inside the work order;
- rollback compatibility is credible.

Do not deploy from an implementation PR.

After review, merge normally.

Then:

```text
MERGED: YES
DEPLOYED: NO
```

Close the source implementation issue as completed.

---

# 20. Phase J — create a separate production work order

Production deployment gets a new Issue.

It must independently lock:

- exact merged source SHA;
- API version;
- frontend version;
- migration set;
- registry/manifest changes;
- backup requirements;
- restore rehearsal;
- rollback artifacts;
- activation order;
- health/smoke;
- authenticated-smoke policy;
- deployment-recording order;
- evidence files;
- fail-closed conditions.

A previous source issue's `Do not deploy` instruction applies to that source issue only.

Production is permitted only by a separate bounded production work order.

Once that production work order is approved/current, the standing owner authorization in
`AGENT-EXECUTION.md` applies unless the owner explicitly says STOP.

---

# 21. Production preflight

Before any host mutation, capture the exact before state.

## Source/provenance

- live GitHub main;
- exact deployment source lock;
- source archive SHA-256;
- clean source tree;
- Node version;
- expected generated contracts.

## Runtime

For managed containers:

- image/tag;
- image ID;
- StartedAt;
- restart count;
- running/health state.

## Frontend

- current symlink targets;
- immutable release availability;
- asset/body hashes where required.

## Database

- migration ledger count;
- migration ledger checksum digest;
- deployment rows;
- module registry manifest/status;
- grants;
- role assignments;
- identity counts/digests;
- business table counts/digests.

## Routing

- gateway Caddy checksum;
- outer Caddy checksum;
- current routes.

## Legacy sentinels

Capture expected status/body hashes for preserved routes such as:

```text
/
/staf
/esys
/erph
/admin/server
```

Do not expose secrets.

---

# 22. Backup, migration and recovery rehearsal

A production migration requires:

- encrypted backup;
- checksum;
- off-host copy/checksum confirmation;
- disposable restore proof.

Before applying an additive migration to production:

1. restore a disposable copy;
2. apply the exact migration;
3. verify schema/grants;
4. verify old API binary compatibility with the migrated schema;
5. verify rollback does not require reversing the migration.

Never run synthetic seed initialization on production.

`scripts/init-staging.ts` is staging/synthetic initialization and must not be used as a production
migration shortcut.

Production migration should invoke the migration engine itself through the approved production
compose/environment path.

---

# 23. New module staging install

On isolated staging, the current plug-in pattern may use:

```bash
sh infra/module-install.sh <ROOT> <id> <version>
sh infra/modules/<id>.smoke.sh <ROOT>
```

This helper:

- creates private module credentials when absent;
- applies staging migrations;
- registers the module;
- starts only the module API;
- reloads module routes;
- checks health.

This is a **staging helper**.

Do not blindly use `module-install.sh` for a production upgrade because it:

- runs staging initializer logic;
- records API release immediately;
- may reload Caddy.

A production work order must explicitly choose the migration, registration, release, recording and
routing steps appropriate to that release.

---

# 24. Production API release

For an already installed module API, use the existing immutable API release mechanism only when the
production work order permits it:

```bash
sh infra/api-release.sh <ROOT> <service> <version> --defer-record
```

Use deferred recording whenever the wider production gate must finish before the deployment row is
written.

Requirements:

- image tag is immutable;
- build once;
- exact source provenance;
- recreate only the target API;
- no other container restart;
- verify reported version;
- keep previous image for rollback.

Never run broad `docker compose up` that may start default image tags.

---

# 25. Frontend immutable release

Build:

```bash
RELEASE_VERSION=<version> npm run build --workspace @kns/<id>-web
```

Pack:

```bash
GIT_COMMIT=<exact-source> \
node --import tsx scripts/release.ts pack <id> <version> <ROOT>/releases
```

Verify:

```bash
node --import tsx scripts/release.ts verify <ROOT>/releases/<id>/<version>
```

Activate:

```bash
node --import tsx scripts/release.ts activate <id> <version> <ROOT>
```

A release directory is immutable.

The same version must never be overwritten.

Activation verifies checksums and switches a single managed symlink.

Keep the prior frontend release for the entire rollback window.

---

# 26. Routing

A new module with public pages/API may require:

- `infra/modules/<id>.caddy`;
- outer coexistence routes.

Routing changes are a separate production risk.

Before mutation:

- back up live route files;
- compare live files with reviewed source;
- preserve unrelated host-only comments/formatting;
- STOP on unrelated semantic/directive divergence.

Validate all Caddy layers before reloading any of them.

Record reload order.

An upgrade that requires no route change must not reload Caddy.

---

# 27. Production smoke

The production work order defines exact smoke.

Typical checks:

- frontend root -> 200;
- immutable assets -> 200;
- expected cache headers;
- API health -> 200;
- version endpoint -> expected version;
- anonymous protected endpoints -> 401;
- actor without permission -> 403 where an existing suitable actor is available;
- module-specific read-only authorized smoke;
- platform health;
- no unrelated container restart;
- DB invariants;
- grant/role/identity invariants;
- legacy sentinel preservation.

Never create production business data merely to prove smoke.

If no suitable existing authenticated actor exists, the production work order may explicitly allow:

```text
DEFERRED — NO SUITABLE EXISTING SESSION
```

with mandatory substitute source/synthetic/invariant evidence.

Do not invent this exception silently. It must be in the governing production work order.

---

# 28. Deployment recording

A release record is written only after its mandatory production gates pass.

API:

```bash
sh infra/record-release.sh <ROOT> <id> api <version> <exact-source>
```

Frontend:

```bash
sh infra/record-release.sh <ROOT> <id> frontend <version> <exact-source>
```

If both API and frontend are released, record only the rows approved by the work order.

Never record a successful deployment before required verification finishes.

Merge is not deployment.

Artifact creation is not deployment.

Migration alone is not deployment.

---

# 29. Rollback

Rollback must be designed before production activation.

## API rollback

Re-activate the previous immutable image:

```bash
sh infra/api-release.sh <ROOT> <id> <previous-version> --defer-record
```

## Frontend rollback

Activate the previous immutable release:

```bash
node --import tsx scripts/release.ts activate <id> <previous-version> <ROOT>
```

## Routing rollback

Restore reviewed route backups in the documented safe order.

## Database rollback

Do not reverse an additive migration during routine rollback.

Do not restore the production database as routine code rollback.

The old binary must have been rehearsed against the new additive schema.

Keep failed immutable artifacts as evidence.

Do not erase historical deployment evidence.

---

# 30. Production evidence and handoff

After every production deployment, rollback or routing change, record measured evidence before
starting another production slice.

Minimum records:

1. `platform/docs/deployment-state.md`;
2. `platform/docs/handoff/CURRENT.md`;
3. `platform/docs/verification/YYYY-MM-DD-<change>-host.md`;
4. governing GitHub Issue;
5. docs-only evidence PR when required.

Evidence should include, as applicable:

- exact source SHA;
- archive SHA-256;
- image digest;
- release.json SHA-256;
- previous/new versions;
- previous/new symlink targets;
- migration ledger before/after;
- migration checksum;
- registry manifest before/after;
- container tuples;
- health results;
- permission/grant/role invariants;
- business-data counts/digests;
- routing backups/checksums;
- Caddy validation/reload results;
- public smoke;
- authenticated smoke or explicit DEFERRED;
- legacy sentinel hashes;
- deployment row IDs;
- backup/restore evidence;
- rollback target/result;
- preliminary failures;
- every UNRUN/DEFERRED proof.

Never claim deployment, build, test, migration or rollback that was not actually measured.

---

# 31. Agent handoff rules

An agent taking over a module must read:

1. this file;
2. `AGENT-EXECUTION.md`;
3. `CURRENT.md`;
4. current architecture;
5. approved module design;
6. live GitHub issue/work order;
7. live GitHub `main`.

When ChatGPT can safely execute a repository action using connected tools, it should execute it
without another approval checkpoint.

When host/SSH execution is required and the current agent has no host capability, provide a complete
copy-paste Codex/Claude/host-runner prompt.

That prompt must include:

- exact repo;
- exact issue;
- source lock;
- versions;
- allowed mutations;
- forbidden mutations;
- preflight;
- exact commands where known;
- smoke;
- invariants;
- rollback;
- evidence requirements;
- standing continuation instruction.

Never hand off only "run Issue #N".

---

# 32. Separate repository rule

The current monorepo is acceptable for trusted KNS developers.

A workspace is not an access-control boundary.

Before giving an untrusted/external developer repository access, split that independently developed
module into a separate repository or otherwise provide only the minimum source/contract material they
need.

The module must still integrate through the same manifest/API/capability/release contracts.

External developers must never receive:

- production passwords;
- service tokens;
- private keys;
- raw pupil IC datasets;
- private backups;
- unrestricted KNS repository access merely to build one module.

---

# 33. Definition of done — source

A source implementation is complete only when all applicable boxes are satisfied:

- [ ] real workflow documented;
- [ ] charter approved;
- [ ] ownership approved;
- [ ] dependencies declared;
- [ ] permissions declared;
- [ ] API/schema/UI design approved;
- [ ] edge cases documented;
- [ ] manifest valid;
- [ ] focused tests pass;
- [ ] `npm run check` passes;
- [ ] `npm run openapi` generated, not hand edited;
- [ ] platform tests pass;
- [ ] integration passes;
- [ ] platform build passes;
- [ ] root tests pass;
- [ ] server tests pass;
- [ ] root build passes;
- [ ] `git diff --check` passes;
- [ ] applied migrations unchanged;
- [ ] working tree clean;
- [ ] implementation PR reviewed;
- [ ] PR merged;
- [ ] source Issue closed;
- [ ] `MERGED: YES`;
- [ ] `DEPLOYED: NO`.

---

# 34. Definition of done — production

Production is complete only when all applicable boxes are satisfied:

- [ ] separate production work order exists;
- [ ] exact deployment source locked;
- [ ] backup/recovery proof complete;
- [ ] migration rehearsal complete;
- [ ] previous binary compatible with additive schema;
- [ ] rollback artifacts verified;
- [ ] exact API/frontend artifacts built;
- [ ] provenance/checksums captured;
- [ ] only target module changed;
- [ ] public smoke passes;
- [ ] authenticated smoke passes or approved DEFERRED substitute is recorded;
- [ ] platform health passes;
- [ ] container invariants pass;
- [ ] DB/grant/role/identity/business invariants pass;
- [ ] routing/legacy sentinels preserved;
- [ ] deployment records written only after gates;
- [ ] evidence docs merged;
- [ ] production Issue closed;
- [ ] `DEPLOYED: YES`;
- [ ] `ROLLBACK: NOT NEEDED` or rollback fully recorded.

---

# 35. Never

Never:

- duplicate Core identity/authentication/authorization;
- duplicate canonical Master Data;
- let one business module read another module's tables directly;
- let a module read legacy E-SYS/eRPH tables as normal runtime architecture;
- hand-edit generated OpenAPI;
- edit an applied migration;
- use production personal data in tests;
- expose secrets in logs, prompts, issues or evidence;
- create production users/sessions/grants/business records only for smoke;
- make a consequential pupil/staff decision without recorded human authority;
- treat UI visibility as authorization;
- treat merge as deployment;
- treat a local checkout as source authority when GitHub main differs;
- deploy from a source implementation issue without a separate production work order;
- run synthetic staging initialization as a production migration shortcut;
- overwrite unrelated host-only routing/configuration differences;
- claim a test, build, deployment or rollback that was not measured.

---

# 36. Independent package delivery (.knsmod)

For independently delivered modules, the target distribution format is **KNS Module Package v1**:

```text
.knsmod
```

A `.knsmod` is a signed immutable ZIP-based package defined by:

`platform/docs/design/kns-module-package-v1.md`

It is not a generic source ZIP.

The production package contains verified build artifacts and contracts, not a development checkout.

Package rules:

- trusted publisher signature required;
- exact package/file SHA-256 verification;
- Platform Contract v2 manifest;
- OpenAPI contract;
- immutable API OCI image;
- optional already-built frontend release;
- module-local migrations;
- declarative runtime database ACL;
- verification evidence;
- no production secrets.

A package must never supply executable host configuration such as:

- shell scripts;
- Docker Compose;
- Caddy snippets;
- systemd units;
- host mounts;
- Docker socket instructions.

KNS generates runtime/container/routing configuration from the validated manifest.

Third-party package SQL must not run as platform/superuser DB authority.

Package installation is a separate production work order and remains Server Admin host-side in v1.
A browser-facing Module Manager may later show/import package metadata, but web code does not receive
Docker/root privilege.

The canonical package lifecycle is:

```text
Developer build
→ package/sign
→ .knsmod
→ import to quarantine
→ verify signature/contracts
→ inspect permissions/dependencies/migrations
→ backup + disposable rehearsal
→ install disabled
→ smoke/invariants
→ enable
→ record deployment/evidence
```

Built-in modules may continue using the existing repository release path while `.knsmod` support is
introduced incrementally.

---

# 37. Compact module checklist

For a new module, the shortest correct sequence is:

```text
1. Understand school workflow
2. Approve charter
3. Define ownership
4. Declare dependencies/capabilities
5. Define permissions
6. Design API/schema/UI/lifecycle/edge cases
7. Merge approved design
8. Create exact-source bounded implementation issue
9. Develop on independent branch
10. Run focused + full verification
11. Open/review/merge implementation PR
12. Close source issue — DEPLOYED: NO
13. Create separate production work order
14. Backup + restore + migration/rollback rehearsal
15. Build immutable API/frontend artifacts
16. Deploy only this module
17. Run smoke + platform invariants
18. Record deployments
19. Merge evidence/handoff
20. Close production issue
```

That is the standard KNS independent-module lifecycle.

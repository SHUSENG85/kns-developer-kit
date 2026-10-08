# Changelog

## 1.4.0

Authority and contract reconciliation under governing Blueprint v4.1.

- Corrected the Developer Pack, module guide, package specification, README and `kit.json` to
  name Blueprint v4.1 as the governing authority; v4.2 and v4.3 are preserved historical records
  that do not override it.
- Published the relationship-first module guidance: declare owned/consumed entities and
  relationships before implementation, and promote missing canonical relationships through the
  owning domain instead of copying them.
- Reconciled the Module v2 schema and runtime contract with the executable platform contract:
  a module may declare optional `elevatedAuthorities` bundles (`id` plus at least one unique
  permission). A declaration grants no permission to anyone. When the module is enabled, Core
  recognizes a bundle only if every permission is one the module itself declares and none
  contains `*`; other bundles validate here but have no effect. Permissions in a recognized
  bundle are reserved for elevated mode and cannot be given as one-off teacher grants.
  Appointments remain operator-controlled.

Existing manifests remain valid. This release adds no capability, asserts no production
deployment and grants no permission.

## 1.3.0

Feature release under governing Blueprint v4.3.

- Published `master.timetable@1.0.0` with three accepted Master GET operations, parameters, responses, bounds and data proof states.
- Reconciled private/public capability discovery authority and retained Staff Directory callable bytes.
- Added public-only timetable discovery/schema/dependency tests and updated module architecture guidance.
- Corrected generated Module v2 schema to match executable packaging, including modules with no owned schema.

Runtime permission, positive data evidence and provider health remain separate. This release does
not assert a deployed timetable provider or grant `academic.timetable.read`.

## 1.2.1

Developer Kit v1 completion patch.

Fixed and clarified:
- corrected capability discovery schema links to the published `contracts/` paths;
- made `capabilities/catalog.json` the explicit public capability-discovery starting point;
- clarified that a catalog entry without the required published callable operation remains unavailable to third-party implementation;
- aligned repository package metadata with the Developer Kit distribution version.

No production trust, permission grants or unpublished platform interfaces are added by this patch.

## 1.2.0

Third-party-ready public Developer Kit release.

Added:
- reviewed Browser SDK, Server Kit and UI Kit surfaces
- developer-safe public `kns keygen | pack | verify` CLI
- executable public contract/runtime workspaces and lockfile
- buildable `hello-kns` Type B reference module
- real linux/amd64 non-root OCI image build
- release-evidence generation and immutable `.knsmod` packaging flow
- public-only tests and GitHub Actions smoke workflow

Acceptance evidence:
- private KNS publication/synchronization gate passed
- governed public mirror passed
- public-only install, typecheck and tests passed
- real OCI build passed
- disposable-key package/sign/verify flow passed with `PACKAGE_VERIFIED`

This release remains outside the production trust boundary. KNS operator review, platform-dependent validation, installation, enablement and permission assignment remain separate controlled actions.

## 1.1.0

Added the first machine-readable KNS External Developer Contract surface.

- module manifest v2 schema
- database access declaration schema
- package manifest schema
- Ed25519 signature metadata schema
- release evidence schema

These files are generated from executable KNS contracts and guarded by private platform CI/public synchronization checks.

## 1.0.0

Initial public KNS Developer Kit publication.

Published:
- KNS Module Developer Pack v1.0.0
- canonical module development guide
- KNS Module Package v1 specification
- public getting-started README

This release intentionally excluded production configuration, secrets, private KNS application source, real personal datasets and unreviewed internal tooling.

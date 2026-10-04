# Changelog

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

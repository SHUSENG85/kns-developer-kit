# KNS Developer Kit

Official public developer entrypoint for building independently deployable modules for the **KNS School Platform**.

## Status

**Developer Kit v1.3.0 — THIRD-PARTY READY**

Blueprint v4.3 governs the published module guidance. This release adds the accepted
`master.timetable@1.0.0` callable contract, including staff/class slots and positive availability.

The public kit now contains the reviewed developer documentation, executable package contracts, Browser SDK, Server Kit, UI Kit, developer-safe `.knsmod` toolchain, and the buildable `hello-kns` reference module.

The public-only acceptance workflow verifies installation, typechecking/tests, a real linux/amd64 non-root OCI build, release construction, disposable developer key generation, `.knsmod` packing, and offline verification.

This status means a third-party developer can build and statically verify a KNS module using this public repository alone. It does **not** grant production trust, installation permission, role permissions, or access to KNS production data. Platform-dependent validation and installation remain operator-controlled.

## Start here

Read **[KNS-MODULE-DEVELOPER-PACK.md](./KNS-MODULE-DEVELOPER-PACK.md)** completely before changing or generating code.

Then use **[examples/hello-kns](./examples/hello-kns/README.md)** as the executable reference.

## Quick start

Requirements: Node.js 24 and Docker with a buildx builder capable of OCI export.

~~~text
npm ci
npm test
npm run example:build
npm run kns -- keygen <key-id> <dir-outside-the-repository> --module <module-id>
npm run kns -- pack <release-dir> --key <private.pem> --key-id <key-id> --out <dir>
npm run kns -- verify <package.knsmod> --trust <trust-store.json>
~~~

A successful offline package verification ends in `PACKAGE_VERIFIED`. This proves package integrity and static policy only; KNS Module Manager performs platform-dependent validation before review/install.

## Developer surfaces

- [KNS Module Developer Pack v1](./KNS-MODULE-DEVELOPER-PACK.md)
- [Canonical Module Development Guide](./docs/module-guide.md)
- [KNS Module Package v1 specification](./docs/kns-module-package-v1.md)
- [Capability discovery and callable contracts](./capabilities/README.md)
- [Executable JSON Schemas](./contracts/)
- [Browser SDK](./sdk/)
- [Server Kit](./server-kit/)
- [UI Kit](./ui/)
- [Developer-safe CLI/toolchain](./tooling/)
- [hello-kns reference module](./examples/hello-kns/)
- [Changelog](./CHANGELOG.md)

## Architecture and security boundary

Core owns shared identity, authentication, authorization and platform capabilities. Master Data owns canonical school master data. Business modules must not duplicate canonical Master Data or create an independent identity authority.

This public repository is a reviewed distribution, not the private KNS production source repository. Never put production passwords, private keys, service tokens, session cookies, production database copies, raw pupil IC datasets, or other secrets/personal datasets in a module project or support request.

If a required KNS contract or capability cannot be proven from the published kit, treat it as unavailable and report the dependency instead of inventing an interface. Start capability discovery at [`capabilities/catalog.json`](./capabilities/catalog.json); a catalog entry still requires a published callable contract for the operation you need.

## Version boundaries

- Developer Kit distribution: **1.3.0**
- Developer Pack: **1.0.0**
- KNS Module Package specification: **1.0.0**

These versions describe different contracts and do not advance together.

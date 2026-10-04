# KNS Developer CLI v1

Developer-only tooling for KNS Module Package v1. It intentionally exposes only `keygen`, `pack`,
and offline `verify`.

## Requirements

- Node.js 24
- dependencies supplied by the KNS Developer Kit root package
- Docker/OCI tooling is needed by a module build when producing `api/image.oci.tar`; verify itself does
  not execute Docker or package content.

## Commands

```sh
npm run kns -- keygen developer-key ./keys
npm run kns -- pack ./release --key ./keys/developer-key.private.pem --key-id developer-key --out ./dist
npm run kns -- verify ./dist/kns-hello-0.1.0.knsmod --trust ./trust.json
```

A successful offline verification returns `PACKAGE_VERIFIED`. It does **not** mean the signing key is
trusted by a KNS installation and it does not mean the package is installable on a particular platform
state. Platform trust, compatibility review, install and activation are operator-owned.

Private keys must remain outside release inputs and must never be committed or packaged.

This CLI deliberately has no upload, install, activate, rollback, runtime, database or trust-store
administration command.

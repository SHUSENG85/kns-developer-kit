# KNS Developer CLI v1

Developer-only tooling for KNS Module Package v1. It intentionally exposes only `keygen`, `pack`,
and offline `verify`.

## Requirements

- Node.js 24
- dependencies installed from the lockfile: `npm ci`
- Docker/OCI tooling is needed by a module build when producing `api/image.oci.tar` (see
  `npm run example:build`); verify itself does not execute Docker or package content.

## Commands

```sh
npm run kns -- keygen developer-key ./keys --module hello
npm run kns -- pack ./release --key ./keys/developer-key.private.pem --key-id developer-key --out ./dist
npm run kns -- verify ./dist/kns-hello-0.1.0.knsmod --trust ./keys/developer-key.trust-store.json
```

`keygen --module <id>` also writes `<key-id>.trust-store.json`, a public-only trust store scoped to that
module, so you can verify your own package offline. Without `--module` it prints the public trust entry
only. `pack` creates the output directory if needed and never overwrites an existing package.

A successful offline verification returns `PACKAGE_VERIFIED`. It does **not** mean the signing key is
trusted by a KNS installation and it does not mean the package is installable on a particular platform
state. Platform trust, compatibility review, install and activation are operator-owned.

Private keys must remain outside release inputs and must never be committed or packaged.

This CLI deliberately has no upload, install, activate, rollback, runtime, database or trust-store
administration command.

## Example build harness

`npm run example:build` (`tooling/build-example.ts`, with `tooling/release.ts`) builds the
`examples/hello-kns` release directory that `pack` consumes. It is not part of the CLI boundary: it
never signs or installs. It refuses a dirty working tree (`--allow-dirty` records the commit as-is),
needs a git commit or `--source-commit`, and only deletes an output directory it created itself.

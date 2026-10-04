# hello-kns — public reference module

This is the smallest useful **Type B** KNS module reference. It owns no canonical school data and
does not connect directly to Core/Master databases.

It demonstrates:

- Platform Contract v2 module declaration;
- one module permission (`hello.read`);
- Type B frontend/API routes;
- Core-owned authentication/authorization via the public Server Kit;
- browser calls via the public Browser SDK;
- public UI primitives;
- health/version endpoints;
- an OpenAPI contract;
- a real static frontend build and a real API OCI image;
- synthetic-only tests/data.

## Build a signed package

From the repository root (Node 24; Docker with a buildx builder that supports the OCI exporter —
Docker with the containerd image store, or `docker buildx create --use --driver docker-container`):

```sh
npm ci
npm test
npm run example:build
npm run kns -- keygen <key-id> <key-dir-outside-the-repo> --module hello
npm run kns -- pack build/hello-kns/release --key <key-dir>/<key-id>.private.pem --key-id <key-id> --out <package-dir>
npm run kns -- verify <package-dir>/kns-hello-0.1.0.knsmod --trust <key-dir>/<key-id>.trust-store.json
```

`example:build` type-checks, runs the tests, builds the frontend and the API bundle, builds the API
image for `linux/amd64` (non-root, labelled with the module identity), checks the image, and writes the
release directory `build/hello-kns/release/`:

```text
module.json                          real source commit + real OCI manifest digest
verification/release-evidence.json   the commands the build actually ran, with their results
frontend/                            index.html, build-info.json, hashed assets
api/image.oci.tar                    OCI image archive
contracts/openapi.json
```

`examples/hello-kns/module.json` is the *template*: it carries a placeholder commit and a placeholder
`artifacts.apiImage.manifestDigest` that the build replaces with real values. It owns no database
schema (`ownedSchemas: []`), so it ships no migrations and no `database-access.json`.

The signing key must be generated **outside** the repository and release directory. `kns verify`
printing `PACKAGE_VERIFIED` proves package integrity and static policy only; it does not mean a KNS
installation trusts your key or that the package is installable on a particular platform state.
Never invent or embed a signing key.

## Runtime contract (what KNS gives the API container)

The API container receives, from the KNS Module Manager, only:

| Variable | Source | Used for |
| --- | --- | --- |
| `PORT`, `HOST` | fixed by KNS (`8080`, `0.0.0.0`) | listen address |
| `HELLO_SERVICE_TOKEN` | generated per module (`<MODULE_ID>_SERVICE_TOKEN`) | this module's Core service credential |
| `IDENTITY_URL` | KNS operator module settings | Core identity base URL |
| `DATABASE_URL` | generated per module | not used by this example |
| `KNS_MODULE_ID`, `KNS_RELEASE`, `NODE_ENV` | KNS | informational |

The example never reads a generic `SERVICE_TOKEN`. The credential is never packaged, logged or sent to
the browser.

## Expected routes

- frontend: `/hello/`
- API: `/api/v1/hello`
- health: `/api/v1/hello/health`
- version: `/api/v1/hello/version`

## Boundary

The module owns only its synthetic greeting behavior. It owns no pupil, staff, class, enrolment or
identity data. Authentication and authorization remain Core-owned.

## Black-box criterion

A third-party agent should be able to clone the public Developer Kit, read the Developer Pack,
contracts, SDK, Server Kit, UI Kit and this example, then design/build another Type B module without
private KNS repository access.

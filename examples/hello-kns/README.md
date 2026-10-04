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
- synthetic-only tests/data.

This example is intentionally source-level. Producing a signed `.knsmod` additionally requires an
approved signing identity/trust relationship and an OCI image artifact. Never invent or embed a
signing key.

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

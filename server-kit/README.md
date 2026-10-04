# KNS External Server Kit v1

Minimal supported backend primitives for third-party **Type B** KNS modules.

It provides:

- KNS session-cookie extraction for forwarding to Core introspection;
- Core-owned authorization through `createIdentityClient()`;
- a defensive service JSON client;
- permission assertion helper;
- required environment/origin validation;
- capability-version/state resolution.

## Security boundary

A module must never authenticate users itself. Core remains the identity and authorization authority.
The module service credential is injected by the KNS host and must never be shipped in a package,
browser bundle, source archive or support log.

Do not connect directly to Core/Master databases. Consume canonical data through declared KNS
capabilities/contracts. A capability being available does not grant the actor permission to use it.

This public kit deliberately excludes service/delegated assertion APIs, event-feed helpers, database
pooling/migration helpers and internal Fastify wrappers until those surfaces receive separate external
contract review. Their existence in the private platform does not make them public APIs.

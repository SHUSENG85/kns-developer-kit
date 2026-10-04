# KNS Developer Kit

Official public developer entrypoint for building independently deployable modules for the **KNS School Platform**.

## Start here

Read **[KNS-MODULE-DEVELOPER-PACK.md](./KNS-MODULE-DEVELOPER-PACK.md)** completely before changing or generating code.

This repository is designed for developers who may have no prior knowledge of KNS. The Developer Pack tells a coding agent how to discover the required KNS contracts, complete the design gates, respect Core/Master Data ownership, verify the implementation, and produce an installable `.knsmod` release.

## Quick start

You need:

1. this repository;
2. a coding agent such as Codex or Claude Code;
3. a short description of the real school workflow the module should support.

Give the agent this instruction:

~~~text
Read KNS-MODULE-DEVELOPER-PACK.md completely before changing code.

You are developing a third-party module for KNS. Assume I do not know KNS internals.
Follow the Developer Pack. Do not invent KNS APIs, capabilities, permissions or data structures.

Module idea: <describe the real school workflow here>

Start with the design gates. Do not implement until the module design is approved.
Final delivery must include a valid signed .knsmod package and the required verification evidence.
~~~

## Published developer documents

- [KNS Module Developer Pack v1](./KNS-MODULE-DEVELOPER-PACK.md)
- [Canonical Module Development Guide](./docs/module-guide.md)
- [KNS Module Package v1 specification](./docs/kns-module-package-v1.md)
- [Generated module manifest schema](./contracts/module-v2.schema.json)
- [Generated database access schema](./contracts/database-access.schema.json)
- [Generated package manifest schema](./contracts/package-manifest.schema.json)
- [Generated signature schema](./contracts/signature.schema.json)
- [Generated release evidence schema](./contracts/release-evidence.schema.json)
- [Changelog](./CHANGELOG.md)

## Security and ownership boundary

This is a public developer distribution repository, not the private KNS production source repository.

Never put production passwords, private keys, service tokens, session cookies, production database copies, raw pupil IC datasets, or other secrets/personal datasets in a module project or support request.

If a required KNS contract or capability cannot be verified from the published developer materials, stop and report the missing dependency instead of inventing an interface.

## Current status

**Developer Pack v1.0.0 — RELEASED**

Machine-readable package/module schemas are now generated from the executable private KNS contracts and mirrored here. Reviewed SDK/server-kit integration surfaces, shared UI references and a safe example module remain later publication phases. Until those surfaces are published here, treat them as unavailable rather than guessing from internal behavior.

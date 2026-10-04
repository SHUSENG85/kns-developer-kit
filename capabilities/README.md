# KNS Capability Discovery

This directory is the public discovery surface for capabilities that KNS modules may consume.

## Rule

Read `catalog.json` before declaring a platform dependency. A capability is available to a third-party module only when:

1. its ID/version appears in the public catalog;
2. the developer can prove the callable contract needed by the module from published KNS material; and
3. the module declares a compatible `requiredCapabilities` or `optionalCapabilities` entry.

A catalog entry is **not** authorization. Its `permissions` describe the permission enforced by the owning service. Installation never grants that permission automatically.

A `contractReference` identifies the owning KNS API surface. It is not permission to infer request or response shapes. If the callable contract is not published, report that as a missing contract and do not implement against guesses.

## Missing capability workflow

If the required canonical capability is absent, do not create a local copy of canonical data, query another domain's database, infer an API from legacy code, or invent a capability.

Create a request that validates against `../schemas/capability-request.schema.json`. The request records the real workflow need, expected canonical owner, minimum information, existing capabilities considered, and why they are insufficient.

This request is an architecture/governance input for the KNS owner. It does not reserve a capability ID and does not imply approval.

## Example: MMI relief

A relief module can discover `master.staff-directory@1.0.0` in the catalog. If it also needs a canonical teacher timetable and no timetable capability is listed, the correct result is a capability request for that missing canonical dataset. The MMI module must remain blocked on that dependency rather than creating its own timetable authority.

## Machine-readable files

- `catalog.json` — generated from capabilities actually provided by reviewed KNS module manifests.
- `master.staff-directory.v1.json` — published callable contract for `master.staff-directory@1.0.0`, including list/detail request and response shapes.
- `../schemas/capability-catalog.schema.json` — catalog schema.
- `../schemas/capability-request.schema.json` — missing-capability request schema.

The private KNS repository remains the implementation authority; this public directory is the reviewed third-party distribution surface.

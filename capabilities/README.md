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

Create a request that validates against `../contracts/capability-request.schema.json`. The request records the real workflow need, expected canonical owner, minimum information, existing capabilities considered, and why they are insufficient.

This request is an architecture/governance input for the KNS owner. It does not reserve a capability ID and does not imply approval.

## Example: MMI relief

A relief module can discover `master.staff-directory@1.0.0` and `master.timetable@1.0.0` and inspect their published callable contracts. It must declare compatible dependencies and obtain the separate Core permissions before calling the owning Master APIs. The timetable contract provides canonical slots and positive availability evidence; it does not implement relief decisions. Any further missing canonical contract requires a capability request rather than a local substitute for canonical authority.

## Machine-readable files

- `master.timetable.v1.json` - generated callable contract for `master.timetable@1.0.0`: staff/class date ranges and positive availability by date/period, including the accepted parameters, responses, bounds and data states.
- `../contracts/capability-callable.schema.json` - validates the generated timetable callable-contract envelope. The existing Staff Directory v1 file retains its accepted earlier shape.

Timetable queries require `academic.timetable.read` separately from capability discovery or installation. Ranges are inclusive and at most 31 days; availability is limited to 500 with an error on overflow. `PROVEN`, `NO_SCHEDULE`, `UNPROVEN` and `CONFLICT` describe data proof, separately from provider health. Unresolved states contain no guessed items. Availability requires positive evidence; absence of a lesson is not proof of free time. Historical queries never fall back to a current timetable. Weekend acceptance does not assert that school is open.

- `catalog.json` — generated from capabilities actually provided by reviewed KNS module manifests.
- `master.staff-directory.v1.json` — published callable contract for `master.staff-directory@1.0.0`, including list/detail request and response shapes.
- `../contracts/capability-catalog.schema.json` — catalog schema.
- `../contracts/capability-request.schema.json` — missing-capability request schema.

The private KNS repository remains the implementation authority; this public directory is the reviewed third-party distribution surface.

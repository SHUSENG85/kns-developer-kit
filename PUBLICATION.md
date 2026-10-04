# Publication and synchronisation policy

The private KNS platform repository is the architecture/implementation authority. This public
repository is the reviewed external developer distribution.

## Drift protection

KNS maintains an allowlisted publication manifest in the private platform repository. CI checks
approved mirrored files against this repository. A platform pull request that changes a published
developer contract without updating the public mirror is expected to fail the Developer Kit sync
check.

This protects against silent drift while keeping publication intentional.

## Why publication is not fully automatic

A platform change must not automatically make arbitrary private source public. New files and new
public API surfaces require review first. Existing allowlisted files can be synchronized mechanically
after review.

The write credential used for publishing, if automation is enabled, must be narrowly scoped to this
public repository and must never be committed to either repository.

## Compatibility

Developer Pack version and runtime compatibility are separate. A module is compatible according to
the platform/package/capability contracts it declares, not merely because it was built with the
latest Developer Pack.

If a required contract is absent from this public kit, treat it as unavailable and report the
dependency. Do not infer it from examples or legacy behavior.

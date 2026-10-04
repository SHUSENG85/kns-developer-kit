# KNS External Browser SDK v1

This is the supported browser integration surface for third-party KNS modules.

Core owns authentication. External modules do **not** implement login, logout, password handling,
session-cookie parsing or the legacy-session bridge.

Supported operations:

- resolve the current KNS actor through Core;
- check a permission locally for UI visibility only;
- call same-origin `/api/v1/*` endpoints;
- automatically attach Core CSRF protection to browser mutations;
- receive normalized KNS API errors.

Server-side permission checks remain authoritative. `hasPermission()` is never an authorization
boundary.

The SDK intentionally rejects cross-origin paths, percent-encoded paths, backslashes and parent-path
segments. Third-party modules must use their declared KNS API route and published capability
contracts.

This source is intentionally dependency-free and may be vendored into an external module until a
versioned package registry is approved.

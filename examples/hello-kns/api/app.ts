import manifest from '../module.json' with { type: 'json' };
import {
  KnsHttpError,
  type KnsActor,
  createIdentityClient,
} from '../../../server-kit/kns-server-kit.ts';

// The module identity and release version come from module.json at build time, so the health check
// reports the version that was actually packaged (KNS compares it with the version it installs).
export const MODULE_ID = manifest.module.id;
export const VERSION = manifest.module.version;
export const PERMISSION = manifest.module.permissions[0];
const API_BASE = manifest.module.apiBasePath;

export type Identity = ReturnType<typeof createIdentityClient>;
export type HelloRequest = {
  method?: string;
  url: string;
  headers: Record<string, string | undefined>;
  requestId: string;
};

/** Builds the route handler around an identity client so tests can substitute Core. */
export function createHandler(identity: Identity) {
  return async function handle(req: HelloRequest): Promise<{ status: number; body: unknown }> {
    const path = new URL(req.url, 'http://module.invalid').pathname;
    const method = (req.method ?? 'GET').toUpperCase();
    if (path !== API_BASE && path !== `${API_BASE}/health` && path !== `${API_BASE}/version`)
      throw new KnsHttpError(404, 'NOT_FOUND', 'Route not found');
    if (method !== 'GET' && method !== 'HEAD')
      throw new KnsHttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    if (path === `${API_BASE}/health`)
      return { status: 200, body: { data: { status: 'ok', version: VERSION } } };
    if (path === `${API_BASE}/version`) return { status: 200, body: { data: { version: VERSION } } };
    // Core owns authentication and authorization: it introspects the browser session for us.
    const actor: KnsActor = await identity(
      { cookie: req.headers.cookie, origin: req.headers.origin, requestId: req.requestId },
      PERMISSION,
    );
    return { status: 200, body: { data: { message: `Hello, ${actor.displayName}.` } } };
  };
}

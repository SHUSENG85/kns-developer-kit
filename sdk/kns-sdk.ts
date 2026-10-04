/**
 * KNS External Browser SDK v1.
 *
 * This deliberately excludes login/logout and the legacy-session bridge. A third-party module
 * runs inside the authenticated KNS staff workspace; Core owns authentication.
 */
export type KnsActor = {
  userId: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  sessionVersion: number;
};

export type KnsSession = { actor: KnsActor; csrfToken: string };
export type KnsFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class KnsApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

export const hasPermission = (actor: KnsActor | null, permission: string) =>
  Boolean(actor?.permissions.includes(permission));

export function createKnsSdk(options: { origin?: string; fetch?: KnsFetcher } = {}) {
  const origin = options.origin ?? globalThis.location?.origin;
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  let session: KnsSession | null = null;

  function endpoint(path: string) {
    if (!origin || !/^\/api\/v1\/[a-z]/.test(path) || path.includes('\\') || path.includes('..') || path.includes('%'))
      throw new Error('Use a same-origin /api/v1/ path');
    const url = new URL(path, origin);
    if (url.origin !== origin) throw new Error('Cross-origin API requests are not allowed');
    return url.href;
  }

  async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await transport(endpoint(path), {
      ...init,
      credentials: 'same-origin',
      redirect: 'error',
    });
    let body: any;
    try {
      body = await response.json();
    } catch {
      throw new KnsApiError(response.status, 'INVALID_RESPONSE', 'Server returned an invalid response');
    }
    if (!response.ok) {
      if (response.status === 401) session = null;
      throw new KnsApiError(
        response.status,
        body.error?.code ?? 'REQUEST_FAILED',
        body.error?.message ?? 'Request failed',
        body.error?.requestId,
      );
    }
    return body.data as T;
  }

  async function refresh() {
    return (session = await send<KnsSession>('/api/v1/core/session'));
  }

  return {
    async getCurrentUser() {
      return (await refresh()).actor;
    },
    hasPermission,
    async apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
      endpoint(path);
      const headers = new Headers(init.headers);
      if (!['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) {
        headers.set('x-csrf-token', (session ?? (await refresh())).csrfToken);
        if (typeof init.body === 'string' && !headers.has('content-type'))
          headers.set('content-type', 'application/json');
      }
      return send<T>(path, { ...init, headers });
    },
  };
}

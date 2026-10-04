import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { KnsHttpError, createIdentityClient } from '../../../server-kit/kns-server-kit.ts';
import { createHandler } from './app.ts';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,80}$/;

/**
 * Minimal HTTP adapter. Responses use the KNS envelope: `{ data }` on success and
 * `{ error: { code, message, requestId } }` on failure; internal details are never returned.
 */
export function createHelloServer(options: { identityUrl: string; serviceToken: string }): Server {
  const handle = createHandler(createIdentityClient(options.identityUrl, options.serviceToken));
  return createServer(async (request, response) => {
    const forwarded = request.headers['x-request-id'];
    const requestId =
      typeof forwarded === 'string' && REQUEST_ID.test(forwarded) ? forwarded : randomUUID();
    const send = (status: number, body: unknown) => {
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-request-id': requestId,
      });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
    };
    try {
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]),
      );
      const result = await handle({
        method: request.method,
        url: request.url ?? '/',
        headers,
        requestId,
      });
      send(result.status, result.body);
    } catch (error) {
      if (error instanceof KnsHttpError)
        send(error.statusCode, { error: { code: error.code, message: error.message, requestId } });
      else {
        console.error(`request ${requestId} failed: ${error instanceof Error ? error.name : 'error'}`);
        send(500, { error: { code: 'INTERNAL_ERROR', message: 'Internal error', requestId } });
      }
    }
  });
}

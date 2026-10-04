import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Stands in for Core's identity introspection endpoint. Synthetic data only.
export type Introspection = { authorization?: string; body: any };
export type FakeCore = { url: string; calls: Introspection[]; close: () => Promise<void> };

const readBody = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (d) => chunks.push(d));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

export async function startFakeCore(
  decide: (call: Introspection) => { status: number; body: unknown },
): Promise<FakeCore> {
  const calls: Introspection[] = [];
  const server: Server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/internal/v1/identity/introspect') {
      response.writeHead(404).end('{}');
      return;
    }
    const call = { authorization: request.headers.authorization, body: JSON.parse(await readBody(request)) };
    calls.push(call);
    const result = decide(call);
    response.writeHead(result.status, { 'content-type': 'application/json' }).end(JSON.stringify(result.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export const syntheticActor = {
  userId: 'user-synthetic-1',
  displayName: 'Synthetic Teacher',
  roles: ['teacher'],
  permissions: ['hello.read'],
  sessionVersion: 1,
};
// A syntactically valid kns_session cookie (43 URL-safe characters); the value is synthetic.
export const SESSION_COOKIE = `kns_session=${'a'.repeat(43)}`;

import manifest from '../module.json' with { type: 'json' };
import { requiredEnv } from '../../../server-kit/kns-server-kit.ts';

/**
 * Runtime configuration as injected by the KNS Module Manager when it starts the container:
 *   PORT / HOST                fixed by KNS (8080 / 0.0.0.0)
 *   <MODULE_ID>_SERVICE_TOKEN  this module's own Core service credential (HELLO_SERVICE_TOKEN here)
 *   IDENTITY_URL               Core identity base URL, supplied by the KNS operator as module settings
 * Nothing is read from the package; the service credential must never be packaged or logged.
 */
export const SERVICE_TOKEN_NAME = `${manifest.module.id.replace(/-/g, '_').toUpperCase()}_SERVICE_TOKEN`;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const identityUrl = new URL(requiredEnv('IDENTITY_URL', env));
  if (!['http:', 'https:'].includes(identityUrl.protocol))
    throw new Error('IDENTITY_URL must be an http(s) URL');
  const port = Number(env.PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');
  return {
    identityUrl: identityUrl.href.replace(/\/+$/, ''),
    serviceToken: requiredEnv(SERVICE_TOKEN_NAME, env),
    host: env.HOST ?? '0.0.0.0',
    port,
  };
}

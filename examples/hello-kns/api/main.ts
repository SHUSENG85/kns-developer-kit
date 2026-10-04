import manifest from '../module.json' with { type: 'json' };
import { loadConfig } from './config.ts';
import { createHelloServer } from './server.ts';

const config = loadConfig();
const server = createHelloServer(config);
server.listen(config.port, config.host, () =>
  console.log(`${manifest.module.id} ${manifest.module.version} listening on ${config.host}:${config.port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => server.close(() => process.exit(0)));

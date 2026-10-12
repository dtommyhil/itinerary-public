import { createServer } from 'node:http';
import next from 'next';
import { createLiveGateway } from './src/infrastructure/realtime/gateway.ts';

const portIndex = process.argv.indexOf('--port');
const port = Number(
  portIndex >= 0 ? process.argv[portIndex + 1] : (process.env.PORT ?? 3000),
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535');
const databaseUrl = process.env.DATABASE_URL;
const authUrl = process.env.BETTER_AUTH_URL;
if (!databaseUrl || !authUrl)
  throw new Error('Configure DATABASE_URL and BETTER_AUTH_URL');
const app = next({ dev: process.env.NODE_ENV !== 'production', port });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer((request, response) => {
  void handle(request, response).catch(() => {
    response.statusCode = 500;
    response.end('An unexpected error occurred');
  });
});
const live = createLiveGateway({
  internalOrigin: `http://127.0.0.1:${port}`,
  publicOrigin: new URL(authUrl).origin,
  databaseUrl,
});
server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/live/'))
    void live.upgrade(request, socket, head);
  // Next attaches its development HMR handler on the first HTTP request.
  // Next leaves unmatched /live paths to this gateway.
});
server.listen(port, '0.0.0.0', () => {
  console.info(JSON.stringify({ event: 'application.started', port }));
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 5000);
  timeout.unref();
  await live.close();
  server.closeAllConnections();
  server.close();
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());

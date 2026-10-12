import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';

type State = { version: number; role: 'owner' | 'editor' | 'viewer' };
type Subscriber = {
  socket: WebSocket;
  tripId: string;
  cookie: string;
  key: string;
  checking: boolean;
  dirty: boolean;
  alive: boolean;
};

/** One bounded gateway per application process. No business writes over sockets. */
export function createLiveGateway({
  internalOrigin,
  publicOrigin,
  databaseUrl,
}: {
  internalOrigin: string;
  publicOrigin: string;
  databaseUrl: string;
}) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    perMessageDeflate: false,
  });
  const subscribers = new Set<Subscriber>();
  let pending = 0;
  let stopped = false;
  let listener: pg.Client | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;

  async function state(tripId: string, cookie: string): Promise<State | null> {
    const response = await fetch(
      `${internalOrigin}/api/trips/${tripId}/live-state`,
      {
        headers: { cookie },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    if ([401, 403, 404].includes(response.status)) return null;
    if (!response.ok) throw new Error('Live authorization unavailable');
    return response.json();
  }
  async function sync(subscriber: Subscriber) {
    if (subscriber.checking) {
      subscriber.dirty = true;
      return;
    }
    subscriber.checking = true;
    try {
      do {
        subscriber.dirty = false;
        const current = await state(subscriber.tripId, subscriber.cookie);
        if (!current) {
          subscriber.socket.close(1008, 'Trip access ended');
          return;
        }
        if (subscriber.socket.readyState !== WebSocket.OPEN) return;
        if (subscriber.socket.bufferedAmount > 65536) {
          subscriber.socket.terminate();
          return;
        }
        subscriber.socket.send(
          JSON.stringify({ type: 'itinerary.changed', ...current }),
        );
      } while (subscriber.dirty && !stopped);
    } catch {
      // No stale data on authorization/database failure. Reconnect resynchronizes.
      subscriber.socket.close(1013, 'Live updates temporarily unavailable');
    } finally {
      subscriber.checking = false;
    }
  }
  function reject(socket: Duplex, status: number) {
    socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
  }
  async function upgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    const match = /^\/live\/trips\/([0-9a-f-]{36})$/.exec(request.url ?? '');
    if (!match || request.headers.origin !== publicOrigin)
      return reject(socket, 403);
    const cookie = request.headers.cookie ?? '';
    if (!cookie) return reject(socket, 401);
    const key = createHash('sha256').update(cookie).digest('hex');
    if (
      pending >= 32 ||
      subscribers.size + pending >= 256 ||
      [...subscribers].filter((s) => s.key === key).length >= 8
    )
      return reject(socket, 429);
    pending++;
    const onError = () => {};
    socket.on('error', onError);
    try {
      if (!(await state(match[1], cookie))) return reject(socket, 403);
      if (socket.destroyed || stopped) return socket.destroy();
      wss.handleUpgrade(request, socket, head, (ws) => {
        const subscriber: Subscriber = {
          socket: ws,
          tripId: match[1],
          cookie,
          key,
          checking: false,
          dirty: false,
          alive: true,
        };
        subscribers.add(subscriber);
        ws.on('pong', () => {
          subscriber.alive = true;
        });
        ws.on('message', () => ws.close(1008, 'Use the trip API to edit'));
        ws.on('error', () => ws.terminate());
        ws.on('close', () => subscribers.delete(subscriber));
        // Register first, then read: a commit during handshake cannot be missed.
        void sync(subscriber);
      });
    } catch {
      reject(socket, 503);
    } finally {
      pending--;
      socket.removeListener('error', onError);
    }
  }
  // LISTEN is a wake-up hint. Periodic state checks cover any missed notification.
  async function listen() {
    const client = new pg.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      application_name: 'itinerary-live',
    });
    listener = client;
    let failed = false;
    function fail() {
      if (failed) return;
      failed = true;
      void client.end().catch(() => {});
      if (!stopped) {
        console.error(JSON.stringify({ event: 'live.listener_disconnected' }));
        reconnect = setTimeout(() => void listen(), 3000);
      }
    }
    client.on('error', fail);
    client.on('end', fail);
    client.on('notification', ({ channel, payload }) => {
      if (channel !== 'itinerary_changed') return;
      for (const subscriber of subscribers)
        if (subscriber.tripId === payload) void sync(subscriber);
    });
    try {
      await client.connect();
      if (stopped) return void client.end();
      await client.query('LISTEN itinerary_changed');
      for (const subscriber of subscribers) void sync(subscriber);
    } catch {
      fail();
    }
  }
  void listen();
  const heartbeat = setInterval(() => {
    for (const subscriber of subscribers) {
      if (!subscriber.alive) {
        subscriber.socket.terminate();
        continue;
      }
      subscriber.alive = false;
      subscriber.socket.ping();
      void sync(subscriber);
    }
  }, 15000);
  heartbeat.unref();
  return {
    upgrade,
    async close() {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(reconnect);
      for (const subscriber of subscribers) subscriber.socket.terminate();
      wss.close();
      await listener?.end().catch(() => {});
    },
  };
}

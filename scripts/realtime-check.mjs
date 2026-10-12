import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import pg from 'pg';

export async function runRealtime({
  db,
  origin,
  ownerCookie,
  userIds,
  cookies,
}) {
  const request = (path, method = 'GET', body, cookie = ownerCookie) =>
    fetch(origin + path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const created = await request('/api/trips', 'POST', {
    name: 'Realtime fixture',
    timezone: 'UTC',
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const base = `/api/trips/${id}`;
  const sockets = [];
  const transaction = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  await transaction.connect();
  async function wait(check, message, timeout = 10000) {
    const end = Date.now() + timeout;
    while (!check()) {
      assert(Date.now() < end, message);
      await delay(25);
    }
  }
  async function connect(cookie, path = `/live/trips/${id}`) {
    const ws = new WebSocket(origin.replace('http', 'ws') + path, {
      headers: { cookie, origin },
    });
    sockets.push(ws);
    const messages = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('error', () => {});
    await wait(() => ws.readyState === WebSocket.OPEN, 'WebSocket must open');
    await wait(() => messages.length, 'Authorized snapshot must arrive');
    return { ws, messages };
  }
  async function denied(
    cookie,
    socketOrigin = origin,
    path = `/live/trips/${id}`,
  ) {
    const ws = new WebSocket(origin.replace('http', 'ws') + path, {
      headers: { cookie, origin: socketOrigin },
    });
    sockets.push(ws);
    ws.on('error', () => {});
    let status;
    ws.on('unexpected-response', (req, response) => {
      status = response.statusCode;
      response.resume();
      req.destroy();
    });
    await wait(
      () => status !== undefined,
      'Unauthorized upgrade must be rejected',
    );
    return status;
  }
  try {
    assert.equal(
      (await request(`${base}/live-state`, 'GET', undefined, '')).status,
      401,
    );
    assert.equal(
      (await request(`${base}/live-state`, 'GET', undefined, cookies[0]))
        .status,
      404,
    );
    assert.equal(await denied(''), 401);
    assert.equal(await denied(ownerCookie, 'https://hostile.example'), 403);
    assert.equal(await denied(cookies[0]), 403);
    await db.query(
      'INSERT INTO "TripMember" ("tripId","userId",role) VALUES ($1,$2,\'editor\'),($1,$3,\'viewer\')',
      [id, ...userIds],
    );
    const owner = await connect(ownerCookie);
    const editor = await connect(cookies[0]);
    const viewer = await connect(cookies[1]);
    assert.deepEqual(viewer.messages.at(-1), {
      type: 'itinerary.changed',
      version: 0,
      role: 'viewer',
    });

    await transaction.query('BEGIN');
    await transaction.query(
      'UPDATE "Trip" SET "itineraryVersion"=1 WHERE id=$1',
      [id],
    );
    await delay(150);
    assert(
      !viewer.messages.some((m) => m.version === 1),
      'Uncommitted writes must not be published',
    );
    await transaction.query('COMMIT');
    await wait(
      () => viewer.messages.some((m) => m.version === 1),
      'Committed change must reach viewer',
    );
    await transaction.query('BEGIN');
    await transaction.query(
      'UPDATE "Trip" SET "itineraryVersion"=2 WHERE id=$1',
      [id],
    );
    await transaction.query('ROLLBACK');
    await delay(150);
    assert(
      !viewer.messages.some((m) => m.version === 2),
      'Rollback must not publish',
    );

    const activity = await request(
      `${base}/itinerary/activities`,
      'POST',
      { version: 1, dayDate: '2028-04-01', title: 'Live coffee' },
      cookies[0],
    );
    assert.equal(activity.status, 201);
    await wait(
      () => owner.messages.some((m) => m.version === 2),
      'Editor write must notify owner',
    );
    await wait(
      () => viewer.messages.some((m) => m.version === 2),
      'Editor write must notify viewer',
    );
    assert.equal(
      (
        await request(`${base}/itinerary/activities`, 'POST', {
          version: 1,
          dayDate: '2028-04-01',
          title: 'Stale write',
        })
      ).status,
      409,
    );

    owner.ws.close();
    await wait(() => owner.ws.readyState === WebSocket.CLOSED, 'Close client');
    assert.equal(
      (
        await request(`${base}/itinerary/activities`, 'POST', {
          version: 2,
          dayDate: '2028-04-01',
          title: 'Missed while offline',
        })
      ).status,
      201,
    );
    const reconnected = await connect(ownerCookie);
    assert.equal(
      reconnected.messages.at(-1).version,
      3,
      'Reconnect must return current revision',
    );

    // A database listener outage must not require restarting the app.
    await db.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='itinerary-live' AND pid <> pg_backend_pid()",
    );
    assert.equal(
      (
        await request(`${base}/itinerary/activities`, 'POST', {
          version: 3,
          dayDate: '2028-04-01',
          title: 'Listener recovers',
        })
      ).status,
      201,
    );
    await wait(
      () => viewer.messages.some((m) => m.version === 4),
      'Listener recovery must resynchronize clients',
      20000,
    );

    await db.query(
      'UPDATE "TripMember" SET role=\'viewer\' WHERE "tripId"=$1 AND "userId"=$2',
      [id, userIds[0]],
    );
    await wait(
      () => editor.messages.some((m) => m.role === 'viewer'),
      'Role change must be reauthorized',
    );
    await db.query(
      'DELETE FROM "TripMember" WHERE "tripId"=$1 AND "userId"=$2',
      [id, userIds[1]],
    );
    let closeCode;
    viewer.ws.on('close', (code) => {
      closeCode = code;
    });
    await wait(
      () => closeCode === 1008,
      'Removed member connection must close',
    );
    assert.equal(
      await denied(cookies[1]),
      403,
      'Removed member must not reconnect',
    );

    editor.ws.send(JSON.stringify({ type: 'edit', title: 'Forged write' }));
    await wait(
      () => editor.ws.readyState === WebSocket.CLOSED,
      'Socket writes are not accepted',
    );
    assert.equal(
      (await (await request(`${base}/live-state`)).json()).version,
      4,
    );
    const revoked = await connect(cookies[0]);
    await db.query('DELETE FROM "Session" WHERE "userId"=$1', [userIds[0]]);
    await wait(
      () => revoked.ws.readyState === WebSocket.CLOSED,
      'Revoked session must close at the next authorization heartbeat',
      25000,
    );
    assert.equal(await denied(cookies[0]), 403);
    await request(base, 'DELETE');
    await wait(
      () => reconnected.ws.readyState === WebSocket.CLOSED,
      'Deleted trip connection must close',
    );
    console.log(
      'PASS: WebSocket sessions/origin/trip isolation, owner/editor/viewer subscriptions, commit/rollback, stale writes, reconnect snapshots, listener recovery, role/removal/deletion and REST-only writes.',
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await transaction.query('ROLLBACK');
    await transaction.end();
    await db.query('DELETE FROM "Trip" WHERE id=$1', [id]);
  }
}

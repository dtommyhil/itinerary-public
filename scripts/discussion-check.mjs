import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function runDiscussion({
  db,
  origin,
  ownerCookie,
  userIds,
  cookies,
}) {
  const request = async (path, method = 'GET', body, cookie = ownerCookie) => {
    if (
      method === 'PATCH' &&
      /^\/api\/trips\/[^/]+(?:\/bookmarks\/[^/]+)?$/.test(path) &&
      body?.version === undefined
    ) {
      const snapshot = await fetch(origin + path, { headers: { cookie } });
      body = {
        ...body,
        version: snapshot.ok ? (await snapshot.json()).version : 0,
      };
    }
    return fetch(origin + path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  const result = async (response, status = 200) => {
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  };
  const trip = await result(
    await request('/api/trips', 'POST', {
      name: 'Discussion fixture',
      timezone: 'UTC',
    }),
    201,
  );
  const other = await result(
    await request('/api/trips', 'POST', {
      name: 'Other discussion fixture',
      timezone: 'UTC',
    }),
    201,
  );
  const base = `/api/trips/${trip.id}`;
  for (let i = 0; i < 2; i++)
    await db.query(
      'INSERT INTO "TripMember" ("tripId","userId",role) VALUES ($1,$2,$3)',
      [trip.id, userIds[i], i === 0 ? 'editor' : 'viewer'],
    );
  const bookmark = await result(
    await request(base + '/bookmarks', 'POST', { title: 'Café discussion' }),
    201,
  );
  const foreign = await result(
    await request(`/api/trips/${other.id}/bookmarks`, 'POST', {
      title: 'Other idea',
    }),
    201,
  );
  const day = await result(
    await request(base + '/itinerary/days', 'POST', {
      version: 0,
      date: '2028-04-01',
    }),
    201,
  );
  const activity = await result(
    await request(base + '/itinerary/activities', 'POST', {
      version: 1,
      dayId: day.id,
      title: 'Walking tour',
    }),
    201,
  );
  const target = { resourceType: 'bookmark', resourceId: bookmark.id };
  const query = new URLSearchParams(target).toString();
  const read = (cookie = ownerCookie) =>
    request(base + '/comments?' + query, 'GET', undefined, cookie);
  const logCount = async () =>
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "ActivityLog" WHERE "tripId"=$1',
        [trip.id],
      )
    ).rows[0].n;
  const initialLogs = await logCount();
  assert.equal(
    initialLogs,
    4,
    'trip, bookmark, day and activity writes logged',
  );
  await result(await read(''), 401);
  await result(
    await request(
      base + '/comments',
      'POST',
      { ...target, body: 'Viewer blocked' },
      cookies[1],
    ),
    403,
  );
  await result(
    await request(base + '/votes', 'POST', { ...target, value: 1 }, cookies[1]),
    403,
  );
  await result(
    await request(base + '/comments', 'POST', { ...target, body: '  ' }),
    400,
  );
  await result(
    await request(base + '/comments', 'POST', {
      ...target,
      body: 'x'.repeat(3001),
    }),
    400,
  );
  await result(
    await request(base + '/comments', 'POST', {
      ...target,
      resourceId: foreign.id,
      body: 'Cross trip',
    }),
    404,
  );
  await result(
    await request(base + '/votes', 'POST', {
      ...target,
      resourceId: foreign.id,
      value: 1,
    }),
    404,
  );
  await result(
    await request(
      `/api/trips/${other.id}/activity`,
      'GET',
      undefined,
      cookies[0],
    ),
    404,
  );
  await result(
    await request(
      `/api/trips/${other.id}/comments?resourceType=bookmark&resourceId=${foreign.id}`,
      'GET',
      undefined,
      cookies[0],
    ),
    404,
  );
  assert.equal(
    await logCount(),
    initialLogs,
    'Rejected writes leave no history',
  );
  const csrf = await fetch(origin + base + '/comments', {
    method: 'POST',
    headers: {
      cookie: ownerCookie,
      origin: 'https://evil.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...target, body: 'CSRF' }),
  });
  await result(csrf, 403);
  // A failure to store history must roll back the user-facing mutation too.
  const constraint = `test_history_${randomUUID().replaceAll('-', '')}`;
  await db.query(
    `ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("tripId" <> '${trip.id}'::uuid OR action <> 'comment.created') NOT VALID`,
  );
  try {
    await result(
      await request(base + '/comments', 'POST', {
        ...target,
        body: 'Must roll back',
      }),
      500,
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM "Comment" WHERE "tripId"=$1',
          [trip.id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(await logCount(), initialLogs);
  } finally {
    await db.query(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`);
  }
  const c = await result(
    await request(
      base + '/comments',
      'POST',
      { ...target, body: 'Editor comment' },
      cookies[0],
    ),
    201,
  );
  await result(
    await request(base + `/comments/${c.id}`, 'PATCH', {
      body: 'Owner cannot rewrite',
      version: 0,
    }),
    403,
  );
  const ownerComment = await result(
    await request(base + '/comments', 'POST', {
      ...target,
      body: 'Owner comment',
      userId: userIds[0],
    }),
    201,
  );
  const author = (
    await db.query('SELECT "userId" FROM "Comment" WHERE id=$1', [
      ownerComment.id,
    ])
  ).rows[0].userId;
  assert.notEqual(author, userIds[0], 'Actor cannot be supplied by the client');
  await result(
    await request(
      base + `/comments/${ownerComment.id}`,
      'DELETE',
      { version: 0 },
      cookies[0],
    ),
    403,
  );
  await result(
    await request(`/api/trips/${other.id}/comments/${c.id}`, 'DELETE', {
      version: 0,
    }),
    404,
  );
  const races = await Promise.all(
    ['First edit', 'Second edit'].map((body) =>
      request(
        base + `/comments/${c.id}`,
        'PATCH',
        { body, version: 0 },
        cookies[0],
      ),
    ),
  );
  assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
  const viewer = await result(await read(cookies[1]));
  assert.equal(viewer.canComment, false);
  assert.equal(viewer.votes.canVote, false);
  assert(viewer.items.every((item) => !item.canEdit && !item.canDelete));
  await result(
    await request(
      base + `/comments/${c.id}`,
      'DELETE',
      { version: 0 },
      cookies[0],
    ),
    409,
  );
  await result(
    await request(base + '/members', 'POST', {
      action: 'role',
      userId: userIds[0],
      role: 'viewer',
    }),
  );
  await result(
    await request(
      base + `/comments/${c.id}`,
      'PATCH',
      { version: 1, body: 'Demoted author' },
      cookies[0],
    ),
    403,
  );
  await result(
    await request(base + '/members', 'POST', {
      action: 'role',
      userId: userIds[0],
      role: 'editor',
    }),
  );
  await result(
    await request(
      base + `/comments/${c.id}`,
      'DELETE',
      { version: 1 },
      cookies[0],
    ),
  );
  await result(
    await request(
      base + `/comments/${c.id}`,
      'DELETE',
      { version: 1 },
      cookies[0],
    ),
    404,
  );
  const votes = await Promise.all(
    [1, 2].map(() =>
      request(base + '/votes', 'POST', { ...target, value: 1 }, cookies[0]),
    ),
  );
  for (const r of votes)
    assert.deepEqual(await result(r), { count: 1, mine: true, canVote: true });
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "Vote" WHERE "bookmarkId"=$1',
        [bookmark.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "ActivityLog" WHERE "tripId"=$1 AND action=\'vote.added\'',
        [trip.id],
      )
    ).rows[0].n,
    1,
  );
  await result(await request(base + '/votes', 'POST', { ...target, value: 1 }));
  const summary = await result(
    await request(base + '/votes?' + query, 'GET', undefined, cookies[1]),
  );
  assert.deepEqual(summary, { count: 2, mine: false, canVote: false });
  await result(
    await request(base + '/votes', 'POST', { ...target, value: 0 }, cookies[0]),
  );
  const beforeRetry = await logCount();
  await result(
    await request(base + '/votes', 'POST', { ...target, value: 0 }, cookies[0]),
  );
  assert.equal(
    await logCount(),
    beforeRetry,
    'Retrying desired vote state creates no extra event',
  );
  // Database integrity holds even when bypassing application code.
  for (const table of ['Comment', 'Vote']) {
    const extraColumns = table === 'Comment' ? ',body,"updatedAt"' : '';
    const extraValues = table === 'Comment' ? ",'Raw comment',now()" : '';
    for (const [bookmarkId, activityId, code] of [
      [foreign.id, null, '23503'],
      [null, null, '23514'],
      [bookmark.id, activity.id, '23514'],
    ])
      await assert.rejects(
        db.query(
          `INSERT INTO "${table}" (id,"tripId","userId","bookmarkId","activityId"${extraColumns}) VALUES ($1,$2,$3,$4,$5${extraValues})`,
          [randomUUID(), trip.id, userIds[0], bookmarkId, activityId],
        ),
        (e) => e.code === code,
      );
  }
  await assert.rejects(
    db.query('UPDATE "ItineraryItem" SET "tripId"=$1 WHERE id=$2', [
      other.id,
      activity.id,
    ]),
    (e) => e.code === '23503',
  );
  for (const body of ['Third comment', 'Fourth comment', 'Fifth comment'])
    await result(
      await request(base + '/comments', 'POST', { ...target, body }),
      201,
    );
  const commentIds = [];
  let cursor;
  do {
    const page = await result(
      await request(
        base +
          '/comments?' +
          query +
          '&limit=1' +
          (cursor ? '&cursor=' + cursor : ''),
      ),
    );
    for (const item of page.items) {
      assert(!commentIds.includes(item.id));
      commentIds.push(item.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(commentIds.length, 4);
  await result(await request(base + '/comments?' + query + '&cursor=bad'), 400);
  await result(await request(base + '/activity?limit=100'), 400);
  const actTarget = { resourceType: 'activity', resourceId: activity.id };
  await result(
    await request(base + '/comments', 'POST', {
      ...actTarget,
      body: 'Activity discussion',
    }),
    201,
  );
  await result(
    await request(base + '/votes', 'POST', { ...actTarget, value: 1 }),
    200,
  );
  await result(
    await request(base + '/itinerary/activities/' + activity.id, 'DELETE', {
      version: 2,
    }),
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "Comment" WHERE "activityId"=$1',
        [activity.id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "Vote" WHERE "activityId"=$1',
        [activity.id],
      )
    ).rows[0].n,
    0,
  );
  await result(
    await request(base + '/comments?' + new URLSearchParams(actTarget)),
    404,
  );
  await result(await request(base + '/bookmarks/' + bookmark.id, 'DELETE'));
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "Comment" WHERE "bookmarkId"=$1',
        [bookmark.id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "Vote" WHERE "bookmarkId"=$1',
        [bookmark.id],
      )
    ).rows[0].n,
    0,
  );
  const events = [];
  cursor = undefined;
  do {
    const page = await result(
      await request(
        base + '/activity?limit=2' + (cursor ? '&cursor=' + cursor : ''),
      ),
    );
    for (const item of page.items) {
      assert(!events.some((old) => old.id === item.id));
      events.push(item);
    }
    cursor = page.nextCursor;
    assert(events.length < 100);
  } while (cursor);
  assert.equal(events.length, await logCount());
  assert(
    events.some(
      (e) =>
        e.description === 'removed an activity' && e.title === 'Walking tour',
    ),
  );
  assert(
    events.some(
      (e) =>
        e.description === 'removed a bookmark' && e.title === 'Café discussion',
    ),
  );
  assert(
    !JSON.stringify(events).includes('Owner comment'),
    'Feed does not retain comment bodies',
  );
  assert(
    !JSON.stringify(events).includes('example.test'),
    'Feed does not expose member emails',
  );
  await result(
    await request(base + '/members', 'POST', {
      action: 'remove',
      userId: userIds[0],
    }),
  );
  await result(
    await request(base + '/activity', 'GET', undefined, cookies[0]),
    404,
  );
  await result(
    await request(
      base + '/comments',
      'POST',
      { ...target, body: 'Removed member' },
      cookies[0],
    ),
    404,
  );
  await result(await request(base, 'DELETE'));
  assert.equal(await logCount(), 0, 'Trip deletion removes its history');
  await result(await request(base + '/activity'), 404);
  await result(await request(`/api/trips/${other.id}`, 'DELETE'));
  console.log(
    'PASS: comment authorship/moderation, viewer and cross-trip boundaries, stale edits, idempotent concurrent votes, SQL target constraints, pagination, transactional feed, removed-member access and cascades.',
  );
}

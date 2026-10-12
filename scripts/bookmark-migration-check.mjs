// Isolated local PostgreSQL database: verifies upgrading existing saved places without data loss.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
const name = `itinerary_migration_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${name}`;
const db = new pg.Client({ connectionString: url.toString() });
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await db.connect();
  const folders = (await readdir('prisma/migrations'))
    .filter((n) => /^\d/.test(n))
    .sort();
  const current = '20260914000100_bookmarks_collections';
  for (const folder of folders.filter((n) => n < current))
    await db.query(
      await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8'),
    );
  const [user, trip, place, saved] = Array.from({ length: 4 }, () =>
    randomUUID(),
  );
  await db.query(
    'INSERT INTO "User" (id,email,name,"updatedAt") VALUES ($1,$2,$3,now())',
    [user, 'migration@example.test', 'Migration'],
  );
  await db.query(
    'INSERT INTO "Trip" (id,name,timezone,"createdBy","updatedAt") VALUES ($1,$2,$3,$4,now())',
    [trip, 'Old trip', 'UTC', user],
  );
  await db.query(
    'INSERT INTO "Place" (id,name,category,metadata,"updatedAt") VALUES ($1,$2,$3,$4,now())',
    [
      place,
      'Existing café',
      'cafe',
      JSON.stringify({
        googleMapsUrl: 'https://www.google.com/maps/place/Cafe',
      }),
    ],
  );
  await db.query(
    'INSERT INTO "SavedPlace" (id,"tripId","placeId","savedBy",notes) VALUES ($1,$2,$3,$4,$5)',
    [saved, trip, place, user, 'Keep my notes'],
  );
  const before = (
    await db.query('SELECT * FROM "SavedPlace" WHERE id=$1', [saved])
  ).rows[0];
  await db.query(
    await readFile(`prisma/migrations/${current}/migration.sql`, 'utf8'),
  );
  const after = (
    await db.query('SELECT * FROM "SavedPlace" WHERE id=$1', [saved])
  ).rows[0];
  for (const key of Object.keys(before))
    assert.deepEqual(after[key], before[key]);
  assert.equal(after.title, 'Existing café');
  assert.equal(after.category, 'cafe');
  assert.equal(after.url, 'https://www.google.com/maps/place/Cafe');
  const discussionMigration = '20261006000200_discussion_activity';
  for (const folder of folders.filter(
    (n) => n > current && n < discussionMigration,
  ))
    await db.query(
      await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8'),
    );
  const day = randomUUID(),
    item = randomUUID();
  await db.query(
    'INSERT INTO "ItineraryDay" (id,"tripId",date) VALUES ($1,$2,$3)',
    [day, trip, '2028-04-01'],
  );
  await db.query(
    'INSERT INTO "ItineraryItem" (id,"itineraryDayId",title,position,"createdBy","updatedAt") VALUES ($1,$2,$3,0,$4,now())',
    [item, day, 'Existing activity', user],
  );
  const oldItem = (
    await db.query('SELECT * FROM "ItineraryItem" WHERE id=$1', [item])
  ).rows[0];
  await db.query(
    await readFile(
      `prisma/migrations/${discussionMigration}/migration.sql`,
      'utf8',
    ),
  );
  for (const folder of folders.filter((n) => n > discussionMigration))
    await db.query(
      await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8'),
    );
  const newItem = (
    await db.query('SELECT * FROM "ItineraryItem" WHERE id=$1', [item])
  ).rows[0];
  for (const key of Object.keys(oldItem))
    assert.deepEqual(newItem[key], oldItem[key]);
  assert.equal(newItem.tripId, trip);
  console.log(
    'PASS: discussion migration backfills itinerary trip IDs without changing existing activity data.',
  );
  console.log(
    'PASS: migration preserves existing bookmark identity, attribution, notes, timestamps, and place relation; backfills title/category/link.',
  );
} finally {
  await db.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}

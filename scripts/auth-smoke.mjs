// Local integration check. Requires migrations; defaults to development mode.
// Uses a local SMTP sink; never sends email to an external recipient.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { runBrowserCheck } from './browser-check.mjs';
import { runCollaboration } from './collaboration-check.mjs';
import { createSmtpSink } from './smtp-sink.mjs';
const origin = 'http://localhost:3101';
const production = process.env.ITINERARY_TEST_PRODUCTION === '1';
const email = `smoke-${randomUUID()}@example.test`;
const fixtureEmails = [email];
const password = randomBytes(24).toString('hex') + 'A1!';
const smtp = await createSmtpSink(production);
const { mail } = smtp;
const server = spawn(process.execPath, ['server.ts', '--port', '3101'], {
  env: {
    ...process.env,
    NODE_ENV: production ? 'production' : 'development',
    ITINERARY_SMOKE_TEST: production ? '0' : '1',
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '2526',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    EMAIL_FROM: 'itinerary@example.test',
    ...(smtp.certificate ? { NODE_EXTRA_CA_CERTS: smtp.certificate } : {}),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
let queuedQueryWarning = false;
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-12000);
    if (
      serverOutput.includes(
        'Calling client.query() when the client is already executing a query',
      )
    )
      queuedQueryWarning = true;
  });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
let connected = false;
let cookie = '';
const testIp = `192.0.2.${1 + Math.floor(Math.random() * 200)}`;
async function post(path, body, method = 'POST') {
  if (
    method === 'PATCH' &&
    /^\/api\/trips\/[^/]+$/.test(path) &&
    body?.version === undefined
  ) {
    const snapshot = await fetch(origin + path, { headers: { cookie } });
    body = {
      ...body,
      version: snapshot.ok ? (await snapshot.json()).version : 0,
    };
  }
  const response = await fetch(origin + path, {
    method,
    headers: {
      origin,
      'content-type': 'application/json',
      cookie,
      'x-forwarded-for': testIp,
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  return response;
}
function mailUrl(index) {
  const decoded = mail[index]
    .replace(/=\r\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  return decoded.match(/http:\/\/localhost:3101\/[^\s<>]+/)[0];
}
function captureCookies(response) {
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
try {
  await db.connect();
  connected = true;
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(origin + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert(ready, 'Application did not start');
  const weakSignup = await post('/api/auth/sign-up/email', {
    name: 'Smoke Test',
    email,
    password: 'lowercase123!',
    callbackURL: '/trips',
  });
  assert.equal(
    weakSignup.status,
    400,
    'Server must reject passwords without uppercase letters',
  );
  let response = await post('/api/auth/sign-up/email', {
    name: 'Smoke Test',
    email,
    password,
    callbackURL: '/trips',
  });
  assert.equal(response.status, 200, 'Signup failed');
  for (let i = 0; i < 40 && mail.length < 1; i++) await delay(250);
  assert.equal(mail.length, 1, 'Verification email not captured');
  const duplicateSignup = await post('/api/auth/sign-up/email', {
    name: 'Smoke Test',
    email,
    password,
    callbackURL: '/trips',
  });
  assert.equal(
    duplicateSignup.status,
    200,
    'Existing emails must receive the same success status',
  );
  assert.equal(
    (await duplicateSignup.json()).token,
    null,
    'Duplicate signup must not authenticate',
  );
  const resent = await post('/api/auth/send-verification-email', {
    email,
    callbackURL: '/trips',
  });
  assert.equal(resent.status, 200, 'Verification resend');
  // Keep the entire burst in one rate-limit window. Later collaboration checks
  // can take over a minute on CI, so their duration must not affect this test.
  for (let i = 0; i < 2; i++) {
    const allowed = await post('/api/auth/send-verification-email', {
      email,
      callbackURL: '/trips',
    });
    assert.equal(allowed.status, 200);
  }
  const throttled = await post('/api/auth/send-verification-email', {
    email,
    callbackURL: '/trips',
  });
  assert.equal(
    throttled.status,
    429,
    'Repeated verification requests must be throttled',
  );
  response = await post('/api/auth/sign-in/email', { email, password });
  assert.equal(response.status, 403, 'Unverified login must fail');
  response = await fetch(mailUrl(0), { redirect: 'manual' });
  assert.equal(response.status, 302, 'Verification redirect');
  captureCookies(response);
  assert(
    cookie.includes('session_token'),
    'Verification should create a session',
  );
  response = await post('/api/trips', {
    name: 'Integration smoke trip',
    timezone: 'America/Denver',
  });
  assert.equal(response.status, 201, 'Trip creation');
  const trip = await response.json();
  const bookmark = {
    title: 'Test café',
    url: 'https://example.test/cafe',
    notes: 'Local smoke fixture',
  };
  response = await post(`/api/trips/${trip.id}/bookmarks`, bookmark);
  assert.equal(response.status, 201);
  response = await post(`/api/trips/${trip.id}/bookmarks`, bookmark);
  assert.equal(response.status, 409, 'Duplicate bookmark rejected');
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      post(`/api/trips/${trip.id}/bookmarks`, {
        ...bookmark,
        url: 'https://example.test/concurrent',
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  const collaborator = await runCollaboration({
    db,
    post,
    origin,
    mail,
    mailUrl,
    fixtureEmails,
    getCookie: () => cookie,
    setCookie: (value) => {
      cookie = value;
    },
    captureCookies,
  });
  const mailIndex = mail.length;
  response = await post('/api/auth/request-password-reset', {
    email,
    redirectTo: '/reset-password',
  });
  assert.equal(response.status, 200);
  for (let i = 0; i < 40 && mail.length < mailIndex + 1; i++) await delay(250);
  assert.equal(mail.length, mailIndex + 1);
  response = await fetch(mailUrl(mailIndex), { redirect: 'manual' });
  const location = response.headers.get('location');
  assert(location, 'Reset redirect');
  const token = new URL(location, origin).searchParams.get('token');
  assert(token);
  const weakReset = await post('/api/auth/reset-password', {
    token,
    newPassword: 'NoSpecial1234',
  });
  assert.equal(
    weakReset.status,
    400,
    'Server must reject passwords without special characters',
  );
  const newPassword = randomBytes(24).toString('hex') + 'A1!';
  response = await post('/api/auth/reset-password', { token, newPassword });
  assert.equal(response.status, 200, 'Password reset');
  response = await post('/api/trips', { name: 'Must fail', timezone: 'UTC' });
  assert.equal(response.status, 401, 'Reset must revoke old sessions');
  cookie = '';
  response = await post('/api/auth/sign-in/email', {
    email,
    password: newPassword,
  });
  assert.equal(response.status, 200, 'Verified password login');
  captureCookies(response);
  response = await post('/api/auth/sign-out', {});
  assert.equal(response.status, 200);
  if (process.env.ITINERARY_BROWSER_TEST === '1')
    await runBrowserCheck({
      origin,
      mail,
      mailUrl,
      fixtureEmails,
      collaborator,
    });
  assert.equal(
    queuedQueryWarning,
    false,
    'Application must not rely on the deprecated pg query queue',
  );
  console.log(
    'PASS: signup, SMTP verification, blocked unverified login, session, atomic trip creation, repeat/concurrent bookmark saves, reset, session revocation, password login, sign-out; no deprecated pg query queue.',
  );
} catch (error) {
  for (const key of [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'SMTP_PASSWORD',
    'GOOGLE_CLIENT_SECRET',
  ]) {
    if (process.env[key])
      serverOutput = serverOutput.replaceAll(process.env[key], '[redacted]');
  }
  serverOutput = serverOutput
    .replace(/([?&]token=)[^&\s]+/g, '$1[redacted]')
    .replace(/(reset-password\/)[^?\s]+/g, '$1[redacted]')
    .replace(/((?:api\/)?join\/)[a-f0-9]{64}/g, '$1[redacted]');
  console.error('Test server diagnostics:', serverOutput);
  throw error;
} finally {
  server.kill('SIGTERM');
  await smtp.close();
  if (connected) {
    const users = await db.query(
      'SELECT id FROM "User" WHERE email = ANY($1::text[])',
      [fixtureEmails],
    );
    const ids = users.rows.map((user) => user.id);
    const places = await db.query(
      'SELECT "placeId" FROM "SavedPlace" WHERE "savedBy" = ANY($1::uuid[])',
      [ids],
    );
    await db.query('DELETE FROM "Trip" WHERE "createdBy" = ANY($1::uuid[])', [
      ids,
    ]);
    for (const { placeId } of places.rows)
      await db.query('DELETE FROM "Place" WHERE id=$1', [placeId]);
    for (const id of ids) {
      await db.query('DELETE FROM "Verification" WHERE value=$1', [id]);
      await db.query('DELETE FROM "User" WHERE id=$1', [id]);
    }
    await db.end();
  }
}

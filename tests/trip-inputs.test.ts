import { expect, it } from 'vitest';
import {
  tripDetails,
  tripUpdateInput,
  memberAction,
  inviteInput,
  tripDates,
} from '../src/domain/trips/inputs';
const base = { name: 'Japan', timezone: 'Asia/Tokyo' };
it('accepts undecided dates and leap days', () => {
  expect(tripDetails.safeParse(base).success).toBe(true);
  expect(
    tripDetails.safeParse({
      ...base,
      startDate: '2028-02-29',
      endDate: '2028-03-01',
    }).success,
  ).toBe(true);
});
it.each([
  { startDate: '2027-02-29', endDate: '2027-03-01' },
  { startDate: '2028-03-02', endDate: '2028-03-01' },
  { startDate: '2028-03-02' },
  { timezone: 'Not/AZone' },
  { name: '   ' },
])('rejects invalid trip details %j', (bad) => {
  expect(tripDetails.safeParse({ ...base, ...bad }).success).toBe(false);
});
it('does not allow owner roles through invitations or role editing', () => {
  expect(
    inviteInput.safeParse({ email: 'a@example.test', role: 'owner' }).success,
  ).toBe(false);
  expect(
    memberAction.safeParse({
      action: 'role',
      userId: '12345678-1234-4234-8234-123456789012',
      role: 'owner',
    }).success,
  ).toBe(false);
});
it('normalizes invited email', () => {
  expect(
    inviteInput.parse({ email: ' Person@Example.com ', role: 'viewer' }).email,
  ).toBe('person@example.com');
});

it('validates the optional shared trip link without accepting executable URLs', () => {
  expect(tripDetails.parse({ ...base, link: '' }).link).toBeNull();
  expect(
    tripDetails.parse({
      ...base,
      link: 'https://drive.google.com/drive/folders/photos',
    }).link,
  ).toBe('https://drive.google.com/drive/folders/photos');
  for (const link of [
    'javascript:alert(1)',
    'http://example.com',
    'https://user:pass@example.com',
  ])
    expect(tripDetails.safeParse({ ...base, link }).success).toBe(false);
});

it('saves named HTTPS links, supports removing all links, and preserves legacy requests', () => {
  const links = [
    { label: ' Photos ', url: 'https://example.com/photos' },
    { label: '', url: 'https://example.com/plans' },
  ];
  const saved = tripDates(tripDetails.parse({ ...base, links }));
  expect(saved.links).toEqual([
    { label: 'Photos', url: 'https://example.com/photos' },
    links[1],
  ]);
  expect(saved.link).toBe('https://example.com/photos');
  expect(tripDates(tripDetails.parse({ ...base, links: [] }))).toMatchObject({
    links: [],
    link: null,
  });
  expect(
    tripDates(
      tripDetails.parse({ ...base, link: 'https://example.com/photos' }),
    ).links,
  ).toEqual([{ label: '', url: 'https://example.com/photos' }]);
  expect(tripDates(tripDetails.parse(base))).not.toHaveProperty('links');
});

it('rejects unsafe, empty, or excessive trip links', () => {
  for (const url of [
    '',
    'javascript:alert(1)',
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com:8443',
  ]) {
    expect(
      tripDetails.safeParse({ ...base, links: [{ label: 'Resource', url }] })
        .success,
    ).toBe(false);
  }
  expect(
    tripDetails.safeParse({
      ...base,
      links: Array(21).fill({ label: '', url: 'https://example.com' }),
    }).success,
  ).toBe(false);
  expect(
    tripDetails.safeParse({
      ...base,
      links: [{ label: 'x'.repeat(101), url: 'https://example.com' }],
    }).success,
  ).toBe(false);
});

it('bounds inclusive ranges to 90 dates, including leap days and single days', () => {
  expect(
    tripDetails.safeParse({
      ...base,
      startDate: '2028-01-01',
      endDate: '2028-03-30',
    }).success,
  ).toBe(true);
  expect(
    tripDetails.safeParse({
      ...base,
      startDate: '2028-01-01',
      endDate: '2028-03-31',
    }).success,
  ).toBe(false);
  expect(
    tripDetails.safeParse({
      ...base,
      startDate: '2028-02-29',
      endDate: '2028-02-29',
    }).success,
  ).toBe(true);
});
it('requires an explicit trip revision on updates', () => {
  for (const version of [undefined, -1, 1.1, '0'])
    expect(tripUpdateInput.safeParse({ ...base, version }).success).toBe(false);
  expect(tripUpdateInput.safeParse({ ...base, version: 0 }).success).toBe(true);
});

import { expect, it } from 'vitest';
import { groupTrips, type TripSummary } from '../src/domain/trips/group-trips';
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const trip = (
  name: string,
  start: string | null,
  end: string | null,
  timezone = 'UTC',
): TripSummary => ({
  id: name,
  name,
  startDate: start ? day(start) : null,
  endDate: end ? day(end) : null,
  timezone,
});
it('orders current/upcoming by start date and keeps undecided dates last without mutating the source', () => {
  const input = [
    trip('Undecided', null, null),
    trip('Later', '2026-12-01', '2026-12-03'),
    trip('Soon', '2026-10-10', '2026-10-11'),
    trip('Ongoing', '2026-10-01', '2026-10-06'),
  ];
  expect(
    groupTrips(input, day('2026-10-06')).upcoming.map((t) => t.name),
  ).toEqual(['Ongoing', 'Soon', 'Later', 'Undecided']);
  expect(input[0].name).toBe('Undecided');
});
it('shows completed trips most recently finished first, keeping the final day current', () => {
  const result = groupTrips(
    [
      trip('Old', '2025-01-01', '2025-01-02'),
      trip('Today', '2026-10-05', '2026-10-06'),
      trip('Recent', '2026-09-01', '2026-09-04'),
    ],
    day('2026-10-06'),
  );
  expect(result.past.map((t) => t.name)).toEqual(['Recent', 'Old']);
  expect(result.upcoming.map((t) => t.name)).toEqual(['Today']);
});
it('uses each destination timezone around midnight rather than the device timezone', () => {
  const result = groupTrips(
    [
      trip('Tokyo', '2026-10-05', '2026-10-06', 'Asia/Tokyo'),
      trip('Denver', '2026-10-05', '2026-10-06', 'America/Denver'),
    ],
    new Date('2026-10-07T00:30:00Z'),
  );
  expect(result.past.map((t) => t.name)).toEqual(['Tokyo']);
  expect(result.upcoming.map((t) => t.name)).toEqual(['Denver']);
});
it('handles an empty list', () =>
  expect(groupTrips([], new Date())).toEqual({ upcoming: [], past: [] }));

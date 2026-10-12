import { describe, expect, it } from 'vitest';
import {
  activityInput,
  dayInput,
  orderInput,
} from '../src/domain/itinerary/inputs';
import { localTime, scheduledInstant } from '../src/domain/itinerary/schedule';
import { itineraryDates } from '../src/domain/itinerary/calendar';
const id = '00000000-0000-4000-8000-000000000001';
describe('trip-local scheduling', () => {
  it('stores an instant and displays the same local time in the trip timezone', () => {
    const instant = scheduledInstant('2028-04-01', '09:30', 'America/Denver');
    expect(instant?.toISOString()).toBe('2028-04-01T15:30:00.000Z');
    expect(localTime(instant, 'America/Denver')).toBe('09:30');
    expect(localTime(instant, 'Asia/Tokyo')).toBe('00:30');
  });
  it.each([
    ['2028-03-12', '02:30'],
    ['2028-11-05', '01:30'],
  ])('rejects skipped/repeated DST time %s %s', (date, time) => {
    expect(() => scheduledInstant(date, time, 'America/Denver')).toThrow(
      'invalid or ambiguous',
    );
  });
  it('supports flexible untimed activities', () => {
    expect(scheduledInstant('2028-04-01', null, 'UTC')).toBeNull();
    expect(localTime(null, 'UTC')).toBeNull();
  });
});
describe('itinerary input boundaries', () => {
  it('rejects impossible dates while accepting leap days', () => {
    expect(dayInput.safeParse({ version: 0, date: '2028-02-29' }).success).toBe(
      true,
    );
    expect(dayInput.safeParse({ version: 0, date: '2027-02-29' }).success).toBe(
      false,
    );
  });
  it.each([
    { startTime: '24:00' },
    { endTime: '11:00' },
    { startTime: '12:00', endTime: '11:00' },
    { url: 'javascript:alert(1)' },
  ])('rejects invalid activity %j', (fields) => {
    expect(
      activityInput.safeParse({
        version: 0,
        dayId: id,
        title: 'Lunch',
        ...fields,
      }).success,
    ).toBe(false);
  });
  it('rejects unassigned destinations and calendar strings used as day IDs', () => {
    for (const dayId of ['unscheduled', '', '2028-04-01', null])
      expect(
        activityInput.safeParse({ version: 0, dayId, title: 'Lunch' }).success,
      ).toBe(false);
  });
  it('accepts a calendar date before its day record has been created', () => {
    expect(
      activityInput.safeParse({
        version: 0,
        dayDate: '2028-02-29',
        title: 'Lunch',
      }).success,
    ).toBe(true);
  });
  it.each([
    {},
    { dayId: id, dayDate: '2028-04-01' },
    { dayDate: '2027-02-29' },
    { dayDate: 'unscheduled' },
  ])(
    'rejects missing, ambiguous, and invalid day destinations %j',
    (destination) => {
      expect(
        activityInput.safeParse({ version: 0, title: 'Lunch', ...destination })
          .success,
      ).toBe(false);
    },
  );
  it('requires a revision and unique ordering IDs', () => {
    expect(orderInput.safeParse({ version: 0, ids: [id, id] }).success).toBe(
      false,
    );
    expect(orderInput.safeParse({ ids: [id] }).success).toBe(false);
    expect(orderInput.safeParse({ version: 0, ids: [id] }).success).toBe(true);
  });
});
describe('trip date calendar', () => {
  it.each([
    ['2028-02-28', '2028-03-01', ['2028-02-28', '2028-02-29', '2028-03-01']],
    ['2027-02-28', '2027-03-01', ['2027-02-28', '2027-03-01']],
    ['2028-12-31', '2029-01-02', ['2028-12-31', '2029-01-01', '2029-01-02']],
    ['2028-03-11', '2028-03-13', ['2028-03-11', '2028-03-12', '2028-03-13']],
    ['2028-11-04', '2028-11-06', ['2028-11-04', '2028-11-05', '2028-11-06']],
    ['2028-04-01', '2028-04-01', ['2028-04-01']],
  ])(
    'includes both endpoints across calendar boundaries %s–%s',
    (start, end, dates) => {
      expect(itineraryDates(start, end, [])).toEqual(dates);
    },
  );
  it('fills empty dates without duplicating saved days', () => {
    expect(itineraryDates('2028-04-01', '2028-04-03', ['2028-04-02'])).toEqual([
      '2028-04-01',
      '2028-04-02',
      '2028-04-03',
    ]);
  });
  it('keeps existing days when trip dates are cleared', () => {
    expect(itineraryDates(null, null, ['2028-04-03', '2028-04-01'])).toEqual([
      '2028-04-01',
      '2028-04-03',
    ]);
  });
});

it('does not expand legacy oversized calendar ranges or discard their saved days', () => {
  expect(itineraryDates('1900-01-01', '9999-12-31', ['2028-04-02'])).toEqual([
    '2028-04-02',
  ]);
  expect(itineraryDates('2028-01-01', '2028-03-30', [])).toHaveLength(90);
});

import { MAX_TRIP_DAYS, tripDayCount } from '../trips/date-range';
/** Calendar dates are independent of the viewer's timezone and saved day records. */
export function itineraryDates(
  startDate: string | null,
  endDate: string | null,
  savedDates: readonly string[],
) {
  const dates = new Set(savedDates);
  // Legacy oversized ranges show saved days; never expand an unbounded range.
  if (
    startDate &&
    endDate &&
    tripDayCount(startDate, endDate) >= 1 &&
    tripDayCount(startDate, endDate) <= MAX_TRIP_DAYS
  ) {
    const date = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (date <= end) {
      dates.add(date.toISOString().slice(0, 10));
      date.setUTCDate(date.getUTCDate() + 1);
    }
  }
  return [...dates].sort();
}

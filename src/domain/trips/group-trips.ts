import { Temporal } from '@js-temporal/polyfill';
export type TripSummary = {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  timezone: string;
};
/** Calendar dates belong to the destination, not the server or viewer's timezone. */
export function groupTrips<T extends TripSummary>(trips: T[], now: Date) {
  const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const trip of trips) {
    const today = instant
      .toZonedDateTimeISO(trip.timezone)
      .toPlainDate()
      .toString();
    if (trip.endDate && trip.endDate.toISOString().slice(0, 10) < today)
      past.push(trip);
    else upcoming.push(trip);
  }
  const tie = (a: T, b: T) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  upcoming.sort((a, b) => {
    if (!a.startDate) return b.startDate ? 1 : tie(a, b);
    if (!b.startDate) return -1;
    return a.startDate.getTime() - b.startDate.getTime() || tie(a, b);
  });
  past.sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime() || tie(a, b));
  return { upcoming, past };
}

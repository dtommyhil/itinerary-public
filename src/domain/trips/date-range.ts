/** Count calendar dates in UTC, inclusive of both endpoints. */
export const MAX_TRIP_DAYS = 90;
export function tripDayCount(start: string, end: string): number {
  return (
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86400000,
    ) + 1
  );
}

import { Temporal } from '@js-temporal/polyfill';
/** Reject skipped/repeated DST times rather than silently choosing a different instant. */
export function scheduledInstant(
  date: string,
  time: string | null,
  timezone: string,
): Date | null {
  if (!time) return null;
  try {
    const local = Temporal.PlainDateTime.from(`${date}T${time}:00`, {
      overflow: 'reject',
    });
    return new Date(
      local.toZonedDateTime(timezone, { disambiguation: 'reject' })
        .epochMilliseconds,
    );
  } catch {
    throw new Error(
      'This local time is invalid or ambiguous in the trip timezone. Choose a time outside the daylight-saving transition.',
    );
  }
}
export function localTime(value: Date | null, timezone: string): string | null {
  return value
    ? Temporal.Instant.fromEpochMilliseconds(value.getTime())
        .toZonedDateTimeISO(timezone)
        .toPlainTime()
        .toString({ smallestUnit: 'minute' })
    : null;
}

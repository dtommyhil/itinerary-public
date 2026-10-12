import { z } from 'zod';
import { MAX_TRIP_DAYS, tripDayCount } from './date-range';
import { tripLink } from './links';
import { bookmarkDetails } from '@/domain/bookmarks/inputs';
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Enter a valid calendar date');
export const tripDetails = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5000).default(''),
    link: bookmarkDetails.shape.url.removeDefault().optional(),
    links: z.array(tripLink).max(20).optional(),
    timezone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid timezone'),
    startDate: calendarDate.nullable().default(null),
    endDate: calendarDate.nullable().default(null),
  })
  .refine(
    (value) =>
      (value.startDate === null && value.endDate === null) ||
      (value.startDate !== null &&
        value.endDate !== null &&
        value.startDate <= value.endDate),
    'Set both dates, with the end on or after the start',
  )
  .refine(
    (v) =>
      !v.startDate ||
      !v.endDate ||
      tripDayCount(v.startDate, v.endDate) <= MAX_TRIP_DAYS,
    `Trips can span up to ${MAX_TRIP_DAYS} days, including the start and end dates`,
  );
export const tripUpdateInput = tripDetails.safeExtend({
  version: z.number().int().min(0),
});
export const memberRole = z.enum(['editor', 'viewer']);
export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
  role: memberRole,
});
export const memberAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('role'), userId: z.uuid(), role: memberRole }),
  z.object({ action: z.literal('remove'), userId: z.uuid() }),
  z.object({ action: z.literal('transfer'), userId: z.uuid() }),
  z.object({ action: z.literal('leave') }),
]);
export function tripDates(data: z.infer<typeof tripDetails>) {
  return {
    ...data,
    ...(data.links !== undefined
      ? { links: data.links, link: data.links[0]?.url ?? null }
      : data.link !== undefined
        ? { links: data.link ? [{ label: '', url: data.link }] : [] }
        : {}),
    startDate: data.startDate ? new Date(`${data.startDate}T00:00:00Z`) : null,
    endDate: data.endDate ? new Date(`${data.endDate}T00:00:00Z`) : null,
  };
}

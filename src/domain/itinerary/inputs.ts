import { z } from 'zod';
import { calendarDate } from '@/domain/trips/inputs';
import { normalizeBookmarkUrl } from '@/domain/bookmarks/inputs';
export const revision = z.object({ version: z.number().int().min(0) });
export const dayInput = revision.extend({ date: calendarDate });
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable()
  .default(null);
export const activityInput = revision
  .extend({
    dayId: z.uuid().optional(),
    dayDate: calendarDate.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(5000).optional(),
    url: z
      .string()
      .trim()
      .max(4096)
      .transform((value, ctx) => {
        if (!value) return null;
        try {
          return normalizeBookmarkUrl(value);
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Enter a valid HTTPS link' });
          return z.NEVER;
        }
      })
      .nullable()
      .optional(),
    startTime: time,
    endTime: time,
    bookmarkId: z.uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.dayId) !== Boolean(v.dayDate),
    'Choose an itinerary day or a calendar date',
  )
  .refine(
    (v) => !v.endTime || (v.startTime && v.endTime >= v.startTime),
    'End time must be on or after start time on the same day',
  );
export const orderInput = revision
  .extend({ ids: z.array(z.uuid()).max(100) })
  .refine(
    (v) => new Set(v.ids).size === v.ids.length,
    'Activity order contains duplicates',
  );

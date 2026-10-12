import { z } from 'zod';
import { normalizeBookmarkUrl } from '@/domain/bookmarks/inputs';

export const tripLink = z.object({
  label: z.string().trim().max(100).default(''),
  url: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .transform((value, ctx) => {
      try {
        return normalizeBookmarkUrl(value);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a valid HTTPS trip link',
        });
        return z.NEVER;
      }
    }),
});
export type TripLink = z.infer<typeof tripLink>;
export function readTripLinks(
  value: unknown,
  legacy?: string | null,
): TripLink[] {
  const parsed = z.array(tripLink).safeParse(value);
  if (parsed.success && parsed.data.length) return parsed.data;
  return legacy ? [{ label: '', url: legacy }] : [];
}

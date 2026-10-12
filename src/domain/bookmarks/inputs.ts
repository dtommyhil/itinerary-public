import { z } from 'zod';
export const categories = [
  'restaurant',
  'cafe',
  'bar',
  'attraction',
  'hotel',
  'activity',
  'other',
] as const;
export const categoryLabels: Record<(typeof categories)[number], string> = {
  restaurant: 'Restaurants',
  cafe: 'Cafés',
  bar: 'Bars',
  attraction: 'Attractions',
  hotel: 'Hotels',
  activity: 'Activities',
  other: 'Other ideas',
};
export function normalizeBookmarkUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('Use an HTTPS link without credentials or a custom port');
  // Keep paths/query ordering/fragments: they may identify a specific event or article section.
  return url.toString();
}
const link = z
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
  });
export const bookmarkDetails = z.object({
  title: z.string().trim().min(1).max(200),
  url: link.nullable().default(null),
  category: z.enum(categories).default('other'),
  notes: z.string().trim().max(5000).default(''),
  collectionIds: z
    .array(z.uuid())
    .max(30)
    .default([])
    .transform((ids) => [...new Set(ids)]),
});
export const bookmarkUpdateInput = bookmarkDetails.extend({
  version: z.number().int().min(0),
});
export const collectionDetails = z.object({
  name: z.string().trim().min(1).max(80),
});
export const bookmarkFilters = z.object({
  category: z.enum(categories).optional(),
  collection: z.union([z.uuid(), z.literal('unfiled')]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
// Keep previously shared itinerary links working; the trip page owns the UI.
export default async function LegacyItinerary({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  const query = await searchParams;
  const suffix = new URLSearchParams();
  for (const key of ['day', 'bookmark']) {
    const value = query[key];
    if (typeof value === 'string' && z.uuid().safeParse(value).success)
      suffix.set(key, value);
  }
  redirect(`/trips/${tripId}${suffix.size ? `?${suffix}` : ''}`);
}

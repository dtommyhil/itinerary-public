import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getTrip } from '@/server/trips/queries';
import { AppError } from '@/server/http/errors';
import { TripDraft } from '../../trip-draft';
export const dynamic = 'force-dynamic';
export default async function EditTrip({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { tripId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session)
    redirect(`/login?next=${encodeURIComponent(`/trips/${tripId}/edit`)}`);
  let trip;
  try {
    trip = await getTrip(session.user.id, tripId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  if (trip.role === 'viewer') redirect(`/trips/${tripId}`);
  return (
    <main className="reference-ui draft-page">
      <TripDraft
        trip={trip}
        selectedDay={(await searchParams).day}
        timezones={Intl.supportedValuesOf('timeZone')}
      />
    </main>
  );
}

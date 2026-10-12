import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getTrip } from '@/server/trips/queries';
import { listBookmarks } from '@/server/bookmarks/service';
import { AppError } from '@/server/http/errors';
import { hasTripPermission } from '@/domain/trips/policies';
import { BookmarkBoard } from './bookmark-board';
export const dynamic = 'force-dynamic';
export default async function Bookmarks({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tripId } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session)
    redirect(`/login?next=${encodeURIComponent(`/trips/${tripId}/bookmarks`)}`);
  const filters = await searchParams;
  let trip;
  let data;
  try {
    trip = await getTrip(session.user.id, tripId);
    data = await listBookmarks(tripId, session.user.id, filters);
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'NOT_FOUND') notFound();
      if (error.code === 'VALIDATION_ERROR')
        return (
          <main>
            <h1>Invalid bookmark filters</h1>
            <Link href={`/trips/${tripId}/bookmarks`}>Show all bookmarks</Link>
          </main>
        );
    }
    throw error;
  }
  return (
    <main className="reference-ui standalone-bookmarks">
      <div className="main column">
        <Link href={`/trips/${tripId}`}>← {trip.name}</Link>
        <h1>Bookmarks</h1>
        <BookmarkBoard
          tripId={tripId}
          {...data}
          category={
            typeof filters.category === 'string' ? filters.category : undefined
          }
          collection={
            typeof filters.collection === 'string'
              ? filters.collection
              : undefined
          }
          canEdit={hasTripPermission(trip.role, 'editContent')}
        />
      </div>
    </main>
  );
}

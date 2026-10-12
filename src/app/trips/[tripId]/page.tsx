export const dynamic = 'force-dynamic';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { getAuth } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { readItinerary } from '@/server/itinerary/service';
import { AppError } from '@/server/http/errors';
import { hasTripPermission } from '@/domain/trips/policies';
import { ItineraryBoard } from './itinerary/itinerary-board';
import { ActivityFeed } from './discussion/activity-feed';
import { ShareDialog } from './share-dialog';
import { listBookmarks } from '@/server/bookmarks/service';
import { BookmarkBoard } from './bookmarks/bookmark-board';
import { QuickAdd } from './quick-add';
import { Icon } from './icons';
import { TripPeople } from './trip-people';
import { readTripLinks } from '@/domain/trips/links';
import { TripSettings } from './trip-settings';
export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{
    day?: string;
    bookmark?: string;
    category?: string;
    collection?: string;
    cursor?: string;
  }>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) notFound();
  if (!session)
    redirect(`/login?next=${encodeURIComponent(`/trips/${tripId}`)}`);
  const member = await getDb().tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: session.user.id } },
    include: { trip: true },
  });
  if (!member) notFound();
  const query = await searchParams;
  let plan;
  let bookmarks;
  let bookmarkError = false;
  try {
    plan = await readItinerary(tripId, session.user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  try {
    bookmarks = await listBookmarks(tripId, session.user.id, query);
  } catch (error) {
    if (
      error instanceof AppError &&
      ['VALIDATION_ERROR', 'NOT_FOUND'].includes(error.code)
    )
      bookmarkError = true;
    else throw error;
  }
  if (query.bookmark && !z.uuid().safeParse(query.bookmark).success) notFound();
  const bookmark = query.bookmark
    ? await getDb().bookmark.findFirst({
        where: { id: query.bookmark, tripId },
        select: { id: true, title: true, url: true, notes: true },
      })
    : null;
  if (query.bookmark && !bookmark) notFound();
  const members = await getDb().tripMember.findMany({
    where: { tripId },
    select: {
      userId: true,
      role: true,
      user: { select: { name: true, email: member.role === 'owner' } },
    },
    orderBy: { joinedAt: 'asc' },
  });
  const invitations =
    member.role === 'owner'
      ? await getDb().tripInvitation.findMany({
          where: {
            tripId,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
  return (
    <main className="reference-ui trip-detail-page">
      <div className="trip-head">
        <div className="column">
          <div className="navigation">
            <Link href="/trips" className="icon" aria-label="All trips">
              <Icon name="back" />
            </Link>
            <div className="nav-actions">
              <ShareDialog
                tripId={tripId}
                tripName={member.trip.name}
                members={members}
                invitations={invitations.map((invite) => ({
                  id: invite.id,
                  email: invite.email,
                  role: invite.role,
                }))}
                role={member.role}
                userId={session.user.id}
              />
              <TripSettings
                selectedDay={query.day}
                trip={{
                  id: tripId,
                  version: member.trip.detailsVersion,
                  name: member.trip.name,
                  description: member.trip.description ?? '',
                  links: readTripLinks(member.trip.links, member.trip.link),
                  timezone: member.trip.timezone,
                  startDate:
                    member.trip.startDate?.toISOString().slice(0, 10) ?? '',
                  endDate:
                    member.trip.endDate?.toISOString().slice(0, 10) ?? '',
                }}
                role={member.role}
              />
            </div>
          </div>
          <div className="trip-title">
            <p className="eyebrow">
              {member.trip.startDate
                ? new Intl.DateTimeFormat('en', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }).format(member.trip.startDate)
                : 'Dates undecided'}
              {member.trip.endDate
                ? ` – ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(member.trip.endDate)}`
                : ''}
            </p>
            <h1>{member.trip.name}</h1>
            <div className="head-bottom trip-summary">
              <div className="trip-summary-content">
                {member.trip.description && (
                  <p className="subtitle">{member.trip.description}</p>
                )}
                <div className="trip-links">
                  {readTripLinks(member.trip.links, member.trip.link).map(
                    (link, index) => (
                      <a
                        key={index}
                        className="trip-link"
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name="link" />
                        {link.label ||
                          new URL(link.url).hostname.replace(/^www\./, '')}
                        <span className="sr-only">
                          {' '}
                          · Trip link (opens in a new tab)
                        </span>
                      </a>
                    ),
                  )}
                </div>
              </div>
              <TripPeople
                members={members}
                userId={session.user.id}
                role={member.role}
              />
            </div>
          </div>
        </div>
      </div>
      <section id="itinerary" aria-labelledby="itinerary-heading">
        <h2 id="itinerary-heading" className="sr-only">
          Itinerary
        </h2>
        <ItineraryBoard
          key={tripId}
          tripId={tripId}
          plan={plan}
          canEdit={hasTripPermission(member.role, 'editContent')}
          selectedDay={query.day}
          bookmark={bookmark ?? undefined}
          role={member.role}
          bookmarks={
            <section
              key="bookmarks"
              id="bookmarks"
              className="trip-bookmarks"
              aria-labelledby="bookmarks-heading"
            >
              <h2 id="bookmarks-heading" className="sr-only">
                Bookmarks
              </h2>
              {bookmarkError || !bookmarks ? (
                <p>
                  Unable to show these bookmark filters.{' '}
                  <Link href={`/trips/${tripId}#bookmarks`}>Clear filters</Link>
                </p>
              ) : (
                <BookmarkBoard
                  embedded
                  tripId={tripId}
                  {...bookmarks}
                  selectedDay={query.day}
                  category={query.category}
                  collection={query.collection}
                  canEdit={hasTripPermission(member.role, 'editContent')}
                />
              )}
            </section>
          }
          activityFeed={<ActivityFeed key="activity-feed" tripId={tripId} />}
        />
      </section>
      {hasTripPermission(member.role, 'editContent') && <QuickAdd />}
    </main>
  );
}

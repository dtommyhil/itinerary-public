export const dynamic = 'force-dynamic';
import { Icon } from './[tripId]/icons';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuth } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { groupTrips } from '@/domain/trips/group-trips';
import { TripList } from './trip-list';
import { SignOut } from './sign-out';
export default async function Trips() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const memberships = await getDb().tripMember.findMany({
    where: { userId: session.user.id },
    select: {
      trip: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          timezone: true,
          _count: { select: { members: true } },
        },
      },
    },
  });
  const { upcoming, past } = groupTrips(
    memberships.map(({ trip }) => trip),
    new Date(),
  );
  const invitations = await getDb().tripInvitation.findMany({
    where: {
      email: session.user.email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { trip: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <main className="reference-ui list-page trips-home">
      <header className="list-nav trips-sticky-header">
        <div className="column">
          <div className="list-nav-top">
            <Link href="/" className="list-brand">
              <span>itinerary</span>
            </Link>
            <SignOut name={session.user.name} email={session.user.email} />
          </div>
          <h1 aria-label="Trips">TRIPS</h1>
        </div>
      </header>
      <Link
        className="new-trip-pill new-trip-floating"
        href="/trips/new"
        aria-label="+ New Trip"
      >
        <Icon name="plus" />
        New Trip
      </Link>
      <div className="column trips-list-content">
        {invitations.length > 0 && (
          <section className="trips-invitations">
            <h2>Invitations</h2>
            <ul>
              {invitations.map((invite) => (
                <li key={invite.id}>
                  <Link href={`/invitations/${invite.id}`}>
                    {invite.trip.name}
                  </Link>{' '}
                  — {invite.role}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-label="Upcoming trips" className="list-section">
          {upcoming.length ? (
            <TripList trips={upcoming} />
          ) : (
            <div className="trips-empty">
              <p>{past.length ? 'No upcoming trips.' : 'No trips yet.'}</p>
              <p>Start with + New Trip.</p>
            </div>
          )}
        </section>
        {past.length > 0 && (
          <section
            aria-labelledby="past-trips-heading"
            className="list-section past-trips-section"
          >
            <h2 className="section-label" id="past-trips-heading">
              Past trips
            </h2>
            <TripList trips={past} />
          </section>
        )}
      </div>
    </main>
  );
}

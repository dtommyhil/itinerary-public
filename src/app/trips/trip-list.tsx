import { Icon } from './[tripId]/icons';
import Link from 'next/link';
import type { TripSummary } from '@/domain/trips/group-trips';
export function TripList({
  trips,
}: {
  trips: (TripSummary & { _count: { members: number } })[];
}) {
  return (
    <ul className="trips-list">
      {trips.map((trip) => (
        <li className="trip-list-item" key={trip.id}>
          <Link className="trip-list-button" href={`/trips/${trip.id}`}>
            <span className="trips-row-copy">
              <h2>
                <strong>{trip.name}</strong>
              </h2>
              <span>
                {trip.startDate
                  ? `${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(trip.startDate)}${trip.endDate ? ` – ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(trip.endDate)}` : ''}`
                  : 'Dates to come'}{' '}
                · {trip._count.members}{' '}
                {trip._count.members === 1 ? 'person' : 'people'}
              </span>
            </span>
          </Link>
          <span aria-hidden="true" className="arrow trips-row-arrow">
            <Icon name="arrow" />
          </span>
        </li>
      ))}
    </ul>
  );
}

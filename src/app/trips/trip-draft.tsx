'use client';
import { notifySaved } from '@/app/components/ui-feedback';
import Link from 'next/link';
import { useSyncExternalStore, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { EditConflict } from './edit-conflict';
import { MAX_TRIP_DAYS } from '@/domain/trips/date-range';
import type { TripLink } from '@/domain/trips/links';
import { TripLinks, linksFromForm } from './trip-links';
import { Icon } from './[tripId]/icons';
export type EditableTrip = {
  id: string;
  version: number;
  name: string;
  description: string | null;
  links: TripLink[];
  timezone: string;
  startDate: string | null;
  endDate: string | null;
};
export function TripDraft({
  trip: initialTrip,
  selectedDay,
  timezones = [],
}: {
  trip?: EditableTrip;
  selectedDay?: string;
  timezones?: string[];
}) {
  const [trip, setTrip] = useState(initialTrip);
  const [formEpoch, setFormEpoch] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [latest, setLatest] = useState<EditableTrip>();
  const [reviewFields, setReviewFields] = useState<
    { label: string; draft: string; latest: string }[]
  >([]);
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const deviceZone = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => 'UTC',
  );
  const [chosenZone, setTimezone] = useState<string | null>(null);
  const timezone = chosenZone ?? trip?.timezone ?? deviceZone;
  const zones = [
    ...new Set([
      timezone,
      'Pacific/Honolulu',
      'America/Denver',
      'America/Los_Angeles',
      'America/New_York',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Ho_Chi_Minh',
      'Europe/Paris',
      'Europe/London',
      'UTC',
      ...timezones,
    ]),
  ];
  return (
    <div className="column">
      <form
        ref={form}
        key={formEpoch}
        className="draft-form"
        aria-label={trip ? 'Edit trip details' : 'Trip details'}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || needsReview) return;
          const data = new FormData(event.currentTarget);
          setBusy(true);
          setMessage('');
          try {
            const response = await fetch(
              trip ? `/api/trips/${trip.id}` : '/api/trips',
              {
                method: trip ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...(trip ? { version: trip.version } : {}),
                  name: data.get('name'),
                  description: data.get('description'),
                  links: linksFromForm(data),
                  startDate: data.get('startDate') || null,
                  endDate: data.get('endDate') || data.get('startDate') || null,
                  timezone: data.get('timezone'),
                }),
              },
            );
            const result = await response.json();
            if (!response.ok) {
              setMessage(result.error.message);
              if (result.error.code === 'STALE_VERSION') setNeedsReview(true);
            } else {
              notifySaved(trip ? 'Trip updated' : 'Trip created');
              router.replace(
                `/trips/${trip?.id ?? result.id}${selectedDay ? `?day=${encodeURIComponent(selectedDay)}` : ''}`,
              );
              router.refresh();
            }
          } catch {
            setMessage('Unable to connect. Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <nav className="navigation" aria-label="Trip editing navigation">
          <Link
            href={
              trip
                ? `/trips/${trip.id}${selectedDay ? `?day=${encodeURIComponent(selectedDay)}` : ''}`
                : '/trips'
            }
            className="icon"
            aria-label={trip ? 'Back to trip' : 'All trips'}
          >
            <Icon name="back" />
          </Link>
          <button className="button" disabled={busy || needsReview}>
            {busy ? 'Saving…' : trip ? 'Save changes' : 'Save trip'}
          </button>
        </nav>
        <p className="eyebrow draft-eyebrow">
          {trip ? 'Trip details' : 'A new adventure'}
        </p>
        <textarea
          className="draft-title"
          aria-label="Trip name"
          name="name"
          defaultValue={trip?.name ?? ''}
          placeholder="give your trip a name"
          rows={1}
          required
          maxLength={160}
          disabled={busy}
        />
        <textarea
          className="draft-description"
          aria-label="Description"
          name="description"
          defaultValue={trip?.description ?? ''}
          placeholder="A little about the trip… (optional)"
          rows={2}
          maxLength={5000}
          disabled={busy}
        />
        <TripLinks links={trip?.links} busy={busy} />
        <div className="row">
          <label className="field">
            Start date · optional
            <input
              aria-label="Start date"
              type="date"
              name="startDate"
              defaultValue={trip?.startDate ?? ''}
              disabled={busy}
            />
          </label>
          <label className="field">
            End date · optional
            <input
              aria-label="End date"
              type="date"
              name="endDate"
              defaultValue={trip?.endDate ?? ''}
              disabled={busy}
            />
          </label>
        </div>
        <p className="field-help">
          Up to {MAX_TRIP_DAYS} days, including the start and end dates.
        </p>
        <label className="field">
          Timezone
          <select
            name="timezone"
            aria-label="Timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            disabled={busy}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        {needsReview && trip && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const response = await fetch(`/api/trips/${trip.id}`, {
                  cache: 'no-store',
                });
                const current = await response.json();
                if (!response.ok)
                  throw new Error(
                    current.error?.message ?? 'Unable to load trip',
                  );
                const draft = new FormData(form.current!);
                const comparable = {
                  Name: [String(draft.get('name')), current.name],
                  Description: [
                    String(draft.get('description')),
                    current.description ?? '',
                  ],
                  'Start date': [
                    String(draft.get('startDate')),
                    current.startDate ?? '',
                  ],
                  'End date': [
                    String(
                      draft.get('endDate') || draft.get('startDate') || '',
                    ),
                    current.endDate ?? '',
                  ],
                  Timezone: [String(draft.get('timezone')), current.timezone],
                  Links: [
                    JSON.stringify(linksFromForm(draft), null, 2),
                    JSON.stringify(current.links, null, 2),
                  ],
                };
                setReviewFields(
                  Object.entries(comparable).map(
                    ([label, [draft, latest]]) => ({ label, draft, latest }),
                  ),
                );
                setLatest(current);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : 'Unable to load trip',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Review latest changes
          </button>
        )}
        {latest && needsReview && (
          <EditConflict
            fields={reviewFields}
            onUseLatest={() => {
              setTrip(latest);
              setTimezone(latest.timezone);
              setFormEpoch((v) => v + 1);
              setNeedsReview(false);
              setMessage('');
              setLatest(undefined);
            }}
            onKeepDraft={() => {
              setTimezone(String(new FormData(form.current!).get('timezone')));
              setTrip(latest);
              setNeedsReview(false);
              setMessage('Draft kept. Review it, then save your changes.');
              setLatest(undefined);
            }}
          />
        )}
        {!trip && (
          <section className="draft-placeholder">
            <h2>Plans will find their place here.</h2>
            <p>
              Save your trip, then start collecting bookmarks and building your
              days.
            </p>
          </section>
        )}
      </form>
    </div>
  );
}

'use client';
import { TripLinks } from './trip-links';
import type { TripLink } from '@/domain/trips/links';
import { useEffect, useRef } from 'react';
export function TripFields({
  trip = {},
  busy,
}: {
  trip?: {
    name?: string;
    description?: string;
    links?: TripLink[];
    startDate?: string;
    endDate?: string;
    timezone?: string;
  };
  busy: boolean;
}) {
  const timezoneInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!trip.timezone && timezoneInput.current)
      timezoneInput.current.value =
        Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, [trip.timezone]);
  return (
    <>
      <label>
        Trip name
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={trip.name ?? ''}
          placeholder="A week in Japan"
          disabled={busy}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          maxLength={5000}
          defaultValue={trip.description ?? ''}
          disabled={busy}
        />
      </label>
      <TripLinks links={trip.links} busy={busy} />
      <label>
        Start date
        <input
          type="date"
          name="startDate"
          defaultValue={trip.startDate ?? ''}
          disabled={busy}
        />
      </label>
      <label>
        End date
        <input
          type="date"
          name="endDate"
          defaultValue={trip.endDate ?? ''}
          disabled={busy}
        />
      </label>
      <p className="field-help">
        Set both dates, or leave both empty while you decide.
      </p>
      <label>
        Timezone
        <input
          name="timezone"
          required
          ref={timezoneInput}
          defaultValue={trip.timezone ?? 'UTC'}
          placeholder="America/Denver"
          disabled={busy}
        />
      </label>
      <p className="field-help">
        Choose the timezone at your destination. Activity times will use this
        timezone.
      </p>
    </>
  );
}

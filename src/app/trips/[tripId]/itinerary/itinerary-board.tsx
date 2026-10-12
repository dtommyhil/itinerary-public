'use client';
import { notifySaved } from '@/app/components/ui-feedback';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { UiDialog } from '../../ui-dialog';
import {
  ActivityForm,
  type Plan,
  type Activity,
  type SourceBookmark,
} from './activity-form';
import { ActivityList } from './activity-list';
import { MAX_TRIP_DAYS, tripDayCount } from '@/domain/trips/date-range';
import { itineraryDates } from '@/domain/itinerary/calendar';
import { requestJson } from '../discussion/request';
import { useLiveItinerary } from './use-live-itinerary';
export function ItineraryBoard({
  tripId,
  plan: incomingPlan,
  canEdit,
  selectedDay,
  bookmark,
  bookmarks,
  activityFeed,
  role,
}: {
  tripId: string;
  plan: Plan;
  canEdit: boolean;
  selectedDay?: string;
  bookmark?: SourceBookmark;
  bookmarks?: ReactNode;
  activityFeed?: ReactNode;
  role: 'owner' | 'editor' | 'viewer';
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(incomingPlan);
  const [receivedPlan, setReceivedPlan] = useState(incomingPlan);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  useLiveItinerary({
    tripId,
    version: plan.version,
    busy,
    role,
    onSnapshot: (snapshot) =>
      setPlan((current) =>
        snapshot.version > current.version ? snapshot : current,
      ),
  });
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<{
    suffix: string;
    method: string;
    body: unknown;
    newDay: boolean;
  } | null>(null);
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [booking, setBooking] = useState({
    source: bookmark?.id,
    open: Boolean(bookmark),
  });
  const [editing, setEditing] = useState<Activity>();
  const [selection, setSelection] = useState({
    source: selectedDay,
    day: selectedDay,
  });
  if (receivedPlan !== incomingPlan) {
    setReceivedPlan(incomingPlan);
    if (!busy && incomingPlan.version >= plan.version) setPlan(incomingPlan);
  }
  if (booking.source !== bookmark?.id)
    setBooking({ source: bookmark?.id, open: Boolean(bookmark) });
  if (selection.source !== selectedDay)
    setSelection({ source: selectedDay, day: selectedDay });
  const scheduling =
    booking.source === bookmark?.id ? booking.open : Boolean(bookmark);
  const activeDay =
    selection.source === selectedDay ? selection.day : selectedDay;
  const savedDays = new Map(plan.days.map((day) => [day.date, day]));
  const calendarPlan: Plan = {
    ...plan,
    days: itineraryDates(
      plan.startDate,
      plan.endDate,
      plan.days.map((day) => day.date),
    ).map((date) => savedDays.get(date) ?? { id: date, date, activities: [] }),
  };
  const day =
    calendarPlan.days.find(
      (day) => day.id === activeDay || day.date === activeDay,
    ) ?? calendarPlan.days[0];
  const savedDay = plan.days.find((saved) => saved.id === day?.id);
  const path = `/trips/${tripId}`;
  const base = `/api/trips/${tripId}/itinerary`;
  async function mutate(
    suffix: string,
    method: string,
    body: unknown,
    newDay = false,
  ): Promise<boolean> {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    setError('');
    setRetry(null);
    try {
      const response = await fetch(base + suffix, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error.message);
        setRetry({ suffix, method, body, newDay });
        if (response.status === 409) {
          try {
            setPlan(await requestJson<Plan>(base));
          } catch {
            /* Keep the current view and draft available. */
          }
        }
        return false;
      }
      try {
        const snapshot = await requestJson<Plan>(base);
        setPlan((current) =>
          snapshot.version >= current.version ? snapshot : current,
        );
      } catch {
        setPlan((current) => ({
          ...current,
          version: Math.max(current.version, plan.version + 1),
        }));
        setError(
          'Saved, but the latest plan could not be loaded. Refresh the plan to see it.',
        );
      }
      if (newDay) setSelection({ source: selectedDay, day: result.id });
      if (suffix.startsWith('/days') && !suffix.endsWith('/order'))
        setManaging(false);
      if (newDay)
        router.push(
          `${path}?day=${result.id}${bookmark ? `&bookmark=${bookmark.id}` : ''}`,
          { scroll: false },
        );
      notifySaved(
        method === 'DELETE'
          ? 'Removed from the itinerary'
          : method === 'PATCH' || method === 'PUT'
            ? 'Changes saved'
            : newDay
              ? 'Day added'
              : bookmark
                ? 'Added to itinerary · bookmark saved'
                : 'Activity added',
      );
      router.refresh();
      return true;
    } catch {
      setError('Unable to save. Your changes are still here.');
      setRetry({ suffix, method, body, newDay });
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  const oversized =
    plan.startDate &&
    plan.endDate &&
    tripDayCount(plan.startDate, plan.endDate) > MAX_TRIP_DAYS;
  return (
    <>
      {oversized && (
        <p className="field-help" role="status">
          This trip exceeds the {MAX_TRIP_DAYS}-day limit. Showing saved days
          only; existing activities are preserved. Shorten the date range when
          updating trip details.
        </p>
      )}
      <div className="datebar itinerary-days">
        {calendarPlan.days.length ? (
          <div
            className="column date-strip"
            role="tablist"
            aria-label="Itinerary days"
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              const links = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role=tab]',
                ),
              ];
              const index = links.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              const target =
                event.key === 'Home'
                  ? links[0]
                  : event.key === 'End'
                    ? links.at(-1)
                    : links[
                        (index +
                          (event.key === 'ArrowRight' ? 1 : -1) +
                          links.length) %
                          links.length
                      ];
              target?.focus({ preventScroll: true });
              target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              target?.click();
            }}
          >
            {calendarPlan.days.map((date) => (
              <button
                className="date"
                key={date.id}
                role="tab"
                aria-controls="day-panel"
                id={`day-${date.id}`}
                aria-selected={date.id === day?.id}
                tabIndex={date.id === day?.id ? 0 : -1}
                onClick={() => {
                  setSelection({ source: selectedDay, day: date.id });
                  router.push(
                    `${path}?day=${date.id}${bookmark ? `&bookmark=${bookmark.id}` : ''}`,
                    { scroll: false },
                  );
                }}
              >
                <span className="weekday">
                  {new Intl.DateTimeFormat('en-US', {
                    weekday: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(`${date.date}T12:00:00Z`))}
                </span>
                <strong className="number">
                  {Number(date.date.slice(-2))}
                </strong>
                <span className="sr-only">
                  {date.date} · {date.activities.length} activities
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="column undated-strip">
            Dates to come
            {canEdit && (
              <>
                {' '}
                ·{' '}
                <Link className="text-button" href={`${path}/edit`}>
                  Set trip dates
                </Link>
              </>
            )}
          </div>
        )}
      </div>
      <div className="main column">
        {role === 'viewer' && (
          <div className="viewer-banner">
            You’re viewing this trip. Plans, bookmarks, and discussions are
            read-only.
          </div>
        )}
        <section
          id="day-panel"
          className="itinerary-day-content"
          role={day ? 'tabpanel' : undefined}
          aria-labelledby={day ? `day-${day.id}` : undefined}
        >
          <div className="day-heading">
            <div>
              <p className="eyebrow">
                {day
                  ? `Day ${calendarPlan.days.findIndex((date) => date.id === day.id) + 1}`
                  : 'The itinerary'}
              </p>
              <h2 aria-label={day?.date}>a day to make our own</h2>
            </div>
            {day && (
              <span className="day-meta">
                {new Intl.DateTimeFormat('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(`${day.date}T12:00:00Z`))}
              </span>
            )}
          </div>
          <span className="save-indicator" aria-live="polite">
            {busy ? 'Saving…' : ''}
          </span>
          {error && !adding && !editing && !scheduling && (
            <div className="save-error">
              <p className="form-error" role="alert">
                {error}
              </p>
              {retry ? (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      retry.suffix,
                      retry.method,
                      {
                        ...(retry.body as Record<string, unknown>),
                        version: plan.version,
                      },
                      retry.newDay,
                    )
                  }
                >
                  Retry
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      setPlan(await requestJson<Plan>(base));
                      setError('');
                      router.refresh();
                    } catch {
                      setError('Unable to load the latest plan. Try again.');
                    }
                  }}
                >
                  Refresh plan
                </button>
              )}
            </div>
          )}
          {canEdit && (
            <button
              id={day ? 'add-activity' : undefined}
              hidden
              onClick={() => {
                setEditing(undefined);
                setAdding(true);
              }}
            >
              Add activity
            </button>
          )}
          {day?.activities.length ? (
            <ActivityList
              revision={plan.version}
              tripId={tripId}
              items={day.activities}
              canEdit={canEdit}
              busy={busy}
              onEdit={(item) => {
                setAdding(false);
                setEditing(item);
              }}
              onDelete={(item) => {
                if (
                  window.confirm(`Remove “${item.title}” from the itinerary?`)
                )
                  void mutate(`/activities/${item.id}`, 'DELETE', {
                    version: plan.version,
                  });
              }}
              onOrder={(ids) =>
                mutate(`/days/${day.id}/order`, 'PUT', {
                  version: plan.version,
                  ids,
                })
              }
              onSave={(item, changes, revision) =>
                mutate(`/activities/${item.id}`, 'PATCH', {
                  version: revision ?? plan.version,
                  dayId: day.id,
                  title: item.title,
                  notes: item.notes,
                  url: item.url,
                  startTime: item.startTime,
                  endTime: item.endTime,
                  ...changes,
                })
              }
            />
          ) : (
            <div className="empty">
              <h3>
                {day
                  ? 'A little room for adventure.'
                  : 'Every trip starts with an idea.'}
              </h3>
              <p>
                {day
                  ? 'Nothing planned for this day yet. Add a plan or choose something from Bookmarks.'
                  : 'Set your dates when you’re ready. In the meantime, save ideas in Bookmarks.'}
              </p>
              {canEdit &&
                (day ? (
                  <button
                    className="text-button"
                    onClick={() => setAdding(true)}
                  >
                    <Icon name="plus" />
                    Add activity
                  </button>
                ) : (
                  <Link className="text-button" href={`${path}/edit`}>
                    <Icon name="plus" />
                    Set dates
                  </Link>
                ))}
            </div>
          )}
          {bookmarks}
        </section>
        {canEdit && (
          <button id="manage-days" hidden onClick={() => setManaging(true)}>
            Manage days
          </button>
        )}
        {canEdit && managing && (
          <UiDialog title="Manage days" onDismiss={() => setManaging(false)}>
            <div className="day-tools">
              <details open={!savedDay}>
                <summary id={!day ? 'add-activity' : undefined}>
                  Add a day
                </summary>
                <form
                  aria-label="Add a day"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate(
                      '/days',
                      'POST',
                      {
                        date: new FormData(event.currentTarget).get('date'),
                        version: plan.version,
                      },
                      true,
                    );
                  }}
                >
                  <label className="field">
                    Date
                    <input
                      name="date"
                      type="date"
                      min={plan.startDate ?? undefined}
                      max={plan.endDate ?? undefined}
                      defaultValue={day?.date ?? plan.startDate ?? ''}
                      required
                      disabled={busy}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Add day
                  </button>
                </form>
              </details>
              {savedDay && (
                <details className="day-settings">
                  <summary>Day settings</summary>
                  <form
                    aria-label="Change day date"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate(`/days/${savedDay.id}`, 'PATCH', {
                        date: new FormData(event.currentTarget).get('date'),
                        version: plan.version,
                      });
                    }}
                  >
                    <label className="field">
                      Change date
                      <input
                        name="date"
                        type="date"
                        min={plan.startDate ?? undefined}
                        max={plan.endDate ?? undefined}
                        defaultValue={savedDay.date}
                        required
                        disabled={busy}
                      />
                    </label>
                    <button className="button" disabled={busy}>
                      Save date
                    </button>
                  </form>
                  <button
                    className="subtle danger-text"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${savedDay.date} and all its activities? Bookmarks will be kept.`,
                        )
                      )
                        void mutate(`/days/${savedDay.id}`, 'DELETE', {
                          version: plan.version,
                        });
                    }}
                  >
                    Delete day
                  </button>
                </details>
              )}
            </div>
          </UiDialog>
        )}
        {activityFeed}
      </div>
      {canEdit && day && (adding || editing || scheduling) && (
        <UiDialog
          title={
            editing
              ? 'Edit activity'
              : scheduling
                ? 'Add to itinerary'
                : 'Add activity'
          }
          onDismiss={() => {
            setAdding(false);
            setEditing(undefined);
            setBooking({ source: bookmark?.id, open: false });
            if (bookmark)
              router.replace(`${path}?day=${day.id}`, { scroll: false });
          }}
        >
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <ActivityForm
            key={editing?.id ?? 'new'}
            plan={calendarPlan}
            dayId={day.id}
            activity={editing}
            bookmark={scheduling ? bookmark : undefined}
            busy={busy}
            onSave={(data, id) => {
              const saved = plan.days.some((day) => day.id === data.dayId);
              return mutate(
                `/activities${id ? `/${id}` : ''}`,
                id ? 'PATCH' : 'POST',
                saved
                  ? data
                  : { ...data, dayId: undefined, dayDate: data.dayId },
              );
            }}
            onCancel={(destinationDay) => {
              setAdding(false);
              setEditing(undefined);
              setBooking({ source: bookmark?.id, open: false });
              if (bookmark)
                router.replace(`${path}?day=${destinationDay ?? day.id}`, {
                  scroll: false,
                });
            }}
          />
        </UiDialog>
      )}
    </>
  );
}

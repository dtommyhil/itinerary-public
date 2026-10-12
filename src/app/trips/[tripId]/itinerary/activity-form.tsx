'use client';
import { useState } from 'react';
import type { readItinerary } from '@/server/itinerary/service';
import type { z } from 'zod';
import type { activityInput } from '@/domain/itinerary/inputs';
export type Plan = Awaited<ReturnType<typeof readItinerary>>;
export type Activity = Plan['days'][number]['activities'][number];
export type SourceBookmark = {
  id: string;
  title: string;
  notes: string | null;
  url: string | null;
};
export function ActivityForm({
  plan,
  dayId,
  activity,
  bookmark,
  busy,
  onSave,
  onCancel,
}: {
  plan: Plan;
  dayId: string;
  activity?: Activity;
  bookmark?: SourceBookmark;
  busy: boolean;
  onSave: (
    data: z.input<typeof activityInput> & { dayId: string },
    id?: string,
  ) => Promise<boolean>;
  onCancel: (destinationDay?: string) => void;
}) {
  const scheduling = Boolean(bookmark && !activity);
  const [version, setVersion] = useState(plan.version);
  const dayField = (
    <label className="field">
      {scheduling ? 'Choose a day' : 'Day'}
      <select
        aria-label="Activity day"
        name="dayId"
        defaultValue={scheduling ? '' : dayId}
        required
        disabled={busy}
      >
        {scheduling && (
          <option value="" disabled>
            Choose a day
          </option>
        )}
        {plan.days.map((day) => (
          <option key={day.id} value={day.id}>
            {new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${day.date}T12:00:00Z`))}
          </option>
        ))}
      </select>
    </label>
  );
  const timeField = (
    <label className="field">
      Time · optional
      <input
        aria-label="Start time"
        name="startTime"
        type="time"
        defaultValue={activity?.startTime ?? ''}
        disabled={busy}
      />
    </label>
  );
  return (
    <form
      className="activity-form"
      aria-label={activity ? 'Edit activity' : 'Add activity'}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const data = new FormData(event.currentTarget);
        if (
          await onSave(
            {
              version,
              dayId: String(data.get('dayId')),
              title: String(data.get('title') ?? bookmark?.title ?? ''),
              notes: String(data.get('notes') ?? bookmark?.notes ?? ''),
              url:
                data.get('url') === null
                  ? (bookmark?.url ?? null)
                  : String(data.get('url')),
              startTime: data.get('startTime')
                ? String(data.get('startTime'))
                : null,
              endTime: data.get('endTime') ? String(data.get('endTime')) : null,
              ...(!activity && bookmark ? { bookmarkId: bookmark.id } : {}),
            },
            activity?.id,
          )
        )
          onCancel(scheduling ? String(data.get('dayId')) : undefined);
      }}
    >
      {scheduling && <p className="detail-text">{bookmark?.title}</p>}
      <div className="fields">
        {scheduling ? (
          <>
            {dayField}
            {timeField}
          </>
        ) : (
          <>
            <label className="field">
              Title
              <input
                aria-label="Activity title"
                name="title"
                required
                maxLength={200}
                defaultValue={activity?.title ?? ''}
                placeholder="What’s the plan?"
                disabled={busy}
                autoFocus
              />
            </label>
            <label className="field">
              Details · optional
              <textarea
                aria-label="Notes (optional)"
                name="notes"
                maxLength={5000}
                defaultValue={activity?.notes ?? ''}
                placeholder="Anything the group should know…"
                disabled={busy}
              />
            </label>
            <div className="row">
              {dayField}
              {timeField}
            </div>
            <label className="field">
              Link · optional
              <input
                aria-label="Link (optional)"
                name="url"
                type="url"
                pattern="https://.*"
                maxLength={4096}
                defaultValue={activity?.url ?? ''}
                placeholder="https://…"
                disabled={busy}
              />
            </label>
            <details
              className="advanced-fields"
              open={Boolean(activity?.endTime)}
            >
              <summary>End time · optional</summary>
              <label className="field">
                <span className="sr-only">End time</span>
                <input
                  aria-label="End time"
                  name="endTime"
                  type="time"
                  defaultValue={activity?.endTime ?? ''}
                  disabled={busy}
                />
              </label>
            </details>
          </>
        )}
      </div>
      {scheduling && (
        <p className="hint">The original bookmark stays saved for the group.</p>
      )}
      <div className="dialog-footer">
        {version !== plan.version && (
          <div className="form-update-hint">
            <p>The plan changed while you were editing. Your draft is kept.</p>
            <button
              type="button"
              className="text-button"
              onClick={() => setVersion(plan.version)}
            >
              Review my draft and retry
            </button>
          </div>
        )}
        <button
          className="subtle"
          type="button"
          onClick={() => onCancel()}
          disabled={busy}
        >
          Cancel
        </button>
        <button className="button" disabled={busy || version !== plan.version}>
          {busy
            ? 'Saving…'
            : activity
              ? 'Save activity'
              : scheduling
                ? 'Add to itinerary'
                : 'Add activity'}
        </button>
      </div>
    </form>
  );
}

'use client';
import { Icon } from '../icons';
import { useState } from 'react';
import type { FeedView } from '@/domain/discussion/contracts';
import { requestJson, requestError } from './request';
export function ActivityFeed({ tripId }: { tripId: string }) {
  const [data, setData] = useState<FeedView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(cursor?: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await requestJson<FeedView>(
        `/api/trips/${tripId}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      setData((current) => ({
        ...result,
        items:
          cursor && current
            ? [
                ...current.items,
                ...result.items.filter(
                  (item) => !current.items.some((old) => old.id === item.id),
                ),
              ]
            : result.items,
      }));
    } catch (error) {
      setError(requestError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="trip-activity" aria-label="Trip activity">
      <details
        className="history activity-feed"
        onToggle={(e) => {
          if (e.currentTarget.open && !data && !busy) void load();
        }}
      >
        <summary>
          <span>Trip activity</span>
          <Icon name="chevron" />
        </summary>
        <p className="field-help">
          Recent changes by your group. Refresh to see new updates.
        </p>
        <button disabled={busy} onClick={() => void load()}>
          Refresh activity
        </button>
        {busy && <p role="status">Loading activity…</p>}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <ul className="activity-feed-list">
          {data?.items.map((item) => (
            <li key={item.id}>
              <p>
                <strong>{item.actor}</strong> {item.description}
                {item.title && (
                  <>
                    {' '}
                    — <span>{item.title}</span>
                  </>
                )}
              </p>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
        {data && !data.items.length && (
          <p>No activity recorded yet. New changes will appear here.</p>
        )}
        {data?.nextCursor && (
          <button disabled={busy} onClick={() => void load(data.nextCursor!)}>
            Older activity
          </button>
        )}
      </details>
    </section>
  );
}

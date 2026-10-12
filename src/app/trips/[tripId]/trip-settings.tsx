'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TripRole } from '@/domain/trips/policies';
import type { EditableTrip } from '../trip-draft';
import { UiDialog } from '../ui-dialog';
import { Icon } from './icons';
export function TripSettings({
  trip,
  role,
  selectedDay,
}: {
  trip: EditableTrip;
  role: TripRole;
  selectedDay?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<'options' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="icon"
        aria-label="Trip options"
        aria-haspopup="dialog"
        onClick={() => {
          setError('');
          setView('options');
        }}
      >
        <Icon name="more" />
      </button>
      {view && (
        <UiDialog
          title={view === 'options' ? 'Trip options' : 'Delete trip'}
          onDismiss={() => setView(null)}
        >
          {view === 'options' ? (
            <div className="menu-options">
              {role !== 'viewer' && (
                <Link
                  href={`/trips/${trip.id}/edit${selectedDay ? `?day=${encodeURIComponent(selectedDay)}` : ''}`}
                >
                  <Icon name="edit" />
                  Edit trip details
                </Link>
              )}
              <button
                onClick={() => {
                  setView(null);
                  requestAnimationFrame(() =>
                    document.getElementById('share-trip')?.click(),
                  );
                }}
              >
                <Icon name="share" />
                Sharing and members
              </button>
              {role !== 'viewer' && (
                <button
                  onClick={() => {
                    setView(null);
                    requestAnimationFrame(() =>
                      document.getElementById('manage-days')?.click(),
                    );
                  }}
                >
                  <Icon name="calendar" />
                  Manage days
                </button>
              )}
              {role === 'owner' && (
                <button
                  className="danger-text"
                  onClick={() => setView('delete')}
                >
                  <Icon name="trash" />
                  Delete trip
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="detail-text">
                This removes the entire trip and its shared plans.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="dialog-footer">
                <button
                  className="subtle"
                  disabled={busy}
                  onClick={() => setView(null)}
                >
                  Cancel
                </button>
                <button
                  className="button danger"
                  aria-label="Delete trip permanently"
                  disabled={busy}
                  onClick={async () => {
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    try {
                      const response = await fetch(`/api/trips/${trip.id}`, {
                        method: 'DELETE',
                      });
                      const result = await response.json();
                      if (!response.ok) setError(result.error.message);
                      else {
                        setView(null);
                        router.push('/trips');
                        router.refresh();
                      }
                    } catch {
                      setError('Unable to connect. Please try again.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Delete trip
                </button>
              </div>
            </>
          )}
        </UiDialog>
      )}
    </>
  );
}

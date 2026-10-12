'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Collection } from './bookmark-form';
export function CollectionManager({
  tripId,
  collections,
}: {
  tripId: string;
  collections: Collection[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(form: HTMLFormElement, id?: string, remove = false) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/trips/${tripId}/collections${id ? `/${id}` : ''}`,
        {
          method: remove ? 'DELETE' : id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: remove
            ? undefined
            : JSON.stringify({ name: new FormData(form).get('name') }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error.message);
        return;
      }
      if (!id) form.reset();
      setMessage(
        remove
          ? 'Collection removed. Bookmarks are kept.'
          : 'Collection saved.',
      );
      if (remove) router.push(`/trips/${tripId}/bookmarks`);
      router.refresh();
    } catch {
      setMessage('Unable to connect. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="collection-manager">
      <summary>Manage collections</summary>
      <p>
        Group your options however you like. A bookmark can belong to more than
        one collection.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
      >
        <label>
          New collection
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Near our hotel"
            disabled={busy}
          />
        </label>
        <button disabled={busy}>Create collection</button>
      </form>
      <p role="status">{message}</p>
      {collections.map((c) => (
        <form
          key={`${c.id}:${c.name}`}
          className="collection-row"
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget, c.id);
          }}
        >
          <label>
            Collection name
            <input
              aria-label={`Rename ${c.name}`}
              name="name"
              required
              maxLength={80}
              defaultValue={c.name}
              disabled={busy}
            />
          </label>
          <div className="bookmark-actions">
            <button disabled={busy}>Rename</button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Delete collection ${c.name}`}
              onClick={(e) => {
                if (
                  window.confirm(
                    `Delete “${c.name}”? Its bookmarks will be kept.`,
                  )
                )
                  void save(e.currentTarget.form!, c.id, true);
              }}
            >
              Delete
            </button>
          </div>
        </form>
      ))}
    </details>
  );
}

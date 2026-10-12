'use client';
import { EditConflict } from '../../edit-conflict';
import { notifySaved } from '@/app/components/ui-feedback';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { categories, categoryLabels } from '@/domain/bookmarks/inputs';
import type { DiscussionSummary } from '@/domain/discussion/contracts';
export type Bookmark = {
  discussion: DiscussionSummary;
  scheduledDays?: string[];
  id: string;
  version: number;
  title: string;
  url: string | null;
  notes: string | null;
  category: (typeof categories)[number];
  collectionIds: string[];
};
export type Collection = { id: string; name: string };
type EditableBookmark = Pick<
  Bookmark,
  'id' | 'version' | 'title' | 'notes' | 'url' | 'category' | 'collectionIds'
>;
export function BookmarkForm({
  tripId,
  collections,
  bookmark: initialBookmark,
  onDone,
}: {
  tripId: string;
  collections: Collection[];
  bookmark?: Bookmark;
  onDone?: (saved?: boolean, updated?: EditableBookmark) => void;
}) {
  const [bookmark, setBookmark] = useState<EditableBookmark | undefined>(
    initialBookmark,
  );
  const [formEpoch, setFormEpoch] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [latest, setLatest] = useState<EditableBookmark>();
  const [reviewFields, setReviewFields] = useState<
    { label: string; draft: string; latest: string }[]
  >([]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      ref={formRef}
      key={formEpoch}
      className="bookmark-form"
      aria-label={bookmark ? 'Edit bookmark' : 'Save a bookmark'}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || needsReview) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        setError('');
        try {
          const response = await fetch(
            `/api/trips/${tripId}/bookmarks${bookmark ? `/${bookmark.id}` : ''}`,
            {
              method: bookmark ? 'PATCH' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...(bookmark ? { version: bookmark.version } : {}),
                title: data.get('title'),
                url: data.get('url'),
                category: data.get('category'),
                notes: data.get('notes'),
                collectionIds: data.getAll('collectionIds'),
              }),
            },
          );
          const result = await response.json();
          if (!response.ok) {
            setError(result.error.message);
            if (result.error.code === 'STALE_VERSION') setNeedsReview(true);
            return;
          }
          notifySaved(bookmark ? 'Changes saved' : 'Bookmark added');
          let updated: EditableBookmark | undefined;
          if (bookmark) {
            try {
              const current = await fetch(
                `/api/trips/${tripId}/bookmarks/${bookmark.id}`,
                { cache: 'no-store' },
              );
              if (current.ok) updated = await current.json();
            } catch {
              // The save succeeded. The route refresh can recover a failed read.
            }
          }
          form.reset();
          onDone?.(true, updated);
          router.refresh();
        } catch {
          setError('Unable to connect. Your changes are still here—try again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="fields">
        <label className="field">
          Title
          <input
            name="title"
            required
            maxLength={200}
            placeholder="A café, an exhibition, a day exploring…"
            autoFocus
            defaultValue={bookmark?.title}
            disabled={busy}
          />
        </label>
        <label className="field">
          Notes (optional)
          <textarea
            name="notes"
            maxLength={5000}
            placeholder="Why it’s worth considering"
            defaultValue={bookmark?.notes ?? ''}
            disabled={busy}
          />
        </label>
        <label className="field">
          Link (optional)
          <input
            name="url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={4096}
            placeholder="https://…"
            defaultValue={bookmark?.url ?? ''}
            disabled={busy}
          />
        </label>
        <label className="field">
          Category
          <select
            aria-label="Category"
            name="category"
            defaultValue={bookmark?.category ?? 'other'}
            disabled={busy}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </label>
        {collections.length > 0 && (
          <fieldset disabled={busy}>
            <legend>Collections (optional)</legend>
            <div className="collection-choices">
              {collections.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    name="collectionIds"
                    value={c.id}
                    defaultChecked={bookmark?.collectionIds.includes(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {needsReview && bookmark && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const response = await fetch(
                `/api/trips/${tripId}/bookmarks/${bookmark.id}`,
                { cache: 'no-store' },
              );
              const current = await response.json();
              if (!response.ok)
                throw new Error(
                  current.error?.message ?? 'Unable to load bookmark',
                );
              const draft = new FormData(formRef.current!);
              const collectionNames = (ids: string[]) =>
                ids
                  .map((id) => collections.find((c) => c.id === id)?.name ?? id)
                  .sort()
                  .join(', ');
              const comparable = {
                Title: [String(draft.get('title')), current.title],
                Notes: [String(draft.get('notes')), current.notes ?? ''],
                Link: [String(draft.get('url')), current.url ?? ''],
                Category: [String(draft.get('category')), current.category],
                Collections: [
                  collectionNames(draft.getAll('collectionIds').map(String)),
                  collectionNames(current.collectionIds),
                ],
              };
              setReviewFields(
                Object.entries(comparable).map(([label, [draft, latest]]) => ({
                  label,
                  draft,
                  latest,
                })),
              );
              setLatest(current);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : 'Unable to load bookmark',
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
            setBookmark(latest);
            setFormEpoch((v) => v + 1);
            setNeedsReview(false);
            setError('');
            setLatest(undefined);
          }}
          onKeepDraft={() => {
            setBookmark(latest);
            setNeedsReview(false);
            setError('Draft kept. Review it, then save your changes.');
            setLatest(undefined);
          }}
        />
      )}
      <div className="dialog-footer">
        {onDone && (
          <button
            className="subtle"
            type="button"
            disabled={busy}
            onClick={() => onDone()}
          >
            Cancel
          </button>
        )}
        <button className="button" disabled={busy || needsReview}>
          {busy ? 'Saving…' : bookmark ? 'Save changes' : 'Save bookmark'}
        </button>
      </div>
    </form>
  );
}

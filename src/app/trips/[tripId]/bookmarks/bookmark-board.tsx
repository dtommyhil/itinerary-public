'use client';
import { CardToggle } from '../card-toggle';
import { UiDialog } from '../../ui-dialog';
import { Icon } from '../icons';
import { DiscussionPanel } from '../discussion/discussion-panel';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { categories, categoryLabels } from '@/domain/bookmarks/inputs';
import { BookmarkForm, type Bookmark, type Collection } from './bookmark-form';
import { CollectionManager } from './collection-manager';
import { useCardState } from '../../card-state';
function BookmarkCard({
  bookmark: incomingBookmark,
  collections,
  tripId,
  canEdit,
}: {
  bookmark: Bookmark;
  collections: Collection[];
  tripId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [bookmark, setBookmark] = useState(incomingBookmark);
  const [received, setReceived] = useState(incomingBookmark);
  const [cardState, updateCardState] = useCardState(
    `bookmark:${incomingBookmark.id}`,
  );
  const expanded = cardState.expanded;
  const setExpanded = (expanded: boolean) => updateCardState({ expanded });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (received !== incomingBookmark) {
    setReceived(incomingBookmark);
    if (!busy && incomingBookmark.version >= bookmark.version)
      setBookmark(incomingBookmark);
  }
  async function saveInline(
    changes: Partial<Pick<Bookmark, 'title' | 'notes'>>,
    version?: number,
  ) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/trips/${tripId}/bookmarks/${bookmark.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version,
            title: bookmark.title,
            notes: bookmark.notes ?? '',
            url: bookmark.url,
            category: bookmark.category,
            collectionIds: bookmark.collectionIds,
            ...changes,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error.message);
        if (result.error.code === 'STALE_VERSION') {
          const response = await fetch(
            `/api/trips/${tripId}/bookmarks/${bookmark.id}`,
            { cache: 'no-store' },
          );
          if (response.ok) {
            const latest = await response.json();
            setBookmark((current) => ({ ...current, ...latest }));
          }
        }
        return false;
      }
      setBookmark((current) => ({
        ...current,
        ...changes,
        version: result.version,
      }));
      router.refresh();
      return true;
    } catch {
      setError('Unable to save. Your edit is still here.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="bookmark bookmark-card" data-bookmark-id={bookmark.id}>
      <DiscussionPanel
        initial={bookmark.discussion}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        tripId={tripId}
        target={{ resourceType: 'bookmark', resourceId: bookmark.id }}
        title={bookmark.title}
        plannedDays={bookmark.scheduledDays}
        summary={
          <CardToggle
            revision={bookmark.version}
            title={bookmark.title}
            notes={bookmark.notes}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
            titleLabel="Bookmark title"
            busy={busy}
            onSaveTitle={
              canEdit
                ? (title, version) => saveInline({ title }, version)
                : undefined
            }
            onSaveNotes={
              canEdit
                ? (notes, version) => saveInline({ notes }, version)
                : undefined
            }
          />
        }
      >
        {bookmark.url && (
          <a
            className="small-link"
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="link" />
            {new URL(bookmark.url).hostname.replace(/^www\./, '')}
            <span className="sr-only"> for {bookmark.title} (new tab)</span>
          </a>
        )}
        <div className="tags">
          <span className="tag">{categoryLabels[bookmark.category]}</span>
          {collections
            .filter((collection) =>
              bookmark.collectionIds.includes(collection.id),
            )
            .map((collection) => (
              <span className="tag" key={collection.id}>
                {collection.name}
              </span>
            ))}
        </div>
        {canEdit && (
          <>
            <Link
              className="schedule-button"
              href={`/trips/${tripId}?bookmark=${bookmark.id}`}
            >
              <Icon name="calendar" />
              Add to itinerary
            </Link>
            <div className="detail-actions">
              <button
                aria-label={`Edit ${bookmark.title}`}
                onClick={() => setEditing(true)}
              >
                <Icon name="edit" />
                Edit bookmark
              </button>
              <button
                aria-label={`Remove ${bookmark.title}`}
                disabled={busy}
                onClick={async () => {
                  if (
                    busy ||
                    !window.confirm(
                      `Remove “${bookmark.title}” from this trip’s bookmarks?`,
                    )
                  )
                    return;
                  setBusy(true);
                  setError('');
                  try {
                    const response = await fetch(
                      `/api/trips/${tripId}/bookmarks/${bookmark.id}`,
                      { method: 'DELETE' },
                    );
                    const data = await response.json();
                    if (!response.ok) setError(data.error.message);
                    else router.refresh();
                  } catch {
                    setError('Unable to remove bookmark. Try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Icon name="trash" />
                Remove
              </button>
            </div>
          </>
        )}
      </DiscussionPanel>
      {editing && (
        <UiDialog title="Edit bookmark" onDismiss={() => setEditing(false)}>
          <BookmarkForm
            tripId={tripId}
            bookmark={bookmark}
            collections={collections}
            onDone={(_, updated) => {
              if (updated)
                setBookmark((current) =>
                  updated.version >= current.version
                    ? { ...current, ...updated }
                    : current,
                );
              setEditing(false);
            }}
          />
        </UiDialog>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </li>
  );
}
export function BookmarkBoard({
  tripId,
  items,
  collections,
  nextCursor,
  category,
  collection,
  canEdit,
  embedded = false,
  selectedDay,
}: {
  embedded?: boolean;
  selectedDay?: string;
  tripId: string;
  items: Bookmark[];
  collections: Collection[];
  nextCursor: string | null;
  category?: string;
  collection?: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [collectionState, updateCollectionState] = useCardState(
    `collection:${tripId}`,
    { expanded: Boolean(category || collection) },
  );
  const open = collectionState.expanded;
  const setOpen = (expanded: boolean) => updateCollectionState({ expanded });
  const path = embedded ? `/trips/${tripId}` : `/trips/${tripId}/bookmarks`;
  function href(
    nextCategory = category,
    nextCollection = collection,
    cursor?: string,
  ) {
    const params = new URLSearchParams();
    if (embedded && selectedDay) params.set('day', selectedDay);
    if (nextCategory) params.set('category', nextCategory);
    if (nextCollection) params.set('collection', nextCollection);
    if (cursor) params.set('cursor', cursor);
    return `${path}${params.size ? `?${params}` : ''}${embedded ? '#bookmarks' : ''}`;
  }
  return (
    <div
      className={
        embedded ? 'bookmarks bookmarks-card bookmarks-collection' : undefined
      }
    >
      {embedded && (
        <button
          className="bookmarks-toggle"
          aria-expanded={open}
          aria-controls="bookmarks-content"
          onClick={() => setOpen(!open)}
        >
          <span className="bookmarks-icon">
            <Icon name="bookmark" />
          </span>
          <span className="bookmarks-caption">
            <span className="bookmarks-title">Bookmarks</span>
            <span className="bookmarks-preview">Ideas for the trip</span>
          </span>
          <span className="bookmarks-count">
            {items.length}
            {nextCursor ? '+' : ''}
          </span>
          <span className={`bookmarks-chevron${open ? ' is-open' : ''}`}>
            <Icon name="chevron" />
          </span>
        </button>
      )}
      {!embedded && (
        <div className="section-heading">
          <div>
            <h2>Bookmarks</h2>
            <p>Ideas for the trip</p>
          </div>
        </div>
      )}
      {canEdit && (
        <button
          id={embedded ? 'add-bookmark' : undefined}
          className={embedded ? 'text-button bookmarks-add' : 'text-button'}
          onClick={() => setAdding(true)}
          aria-expanded={adding}
        >
          <Icon name="plus" />
          Add bookmark
        </button>
      )}
      {adding && canEdit && (
        <UiDialog title="Add bookmark" onDismiss={() => setAdding(false)}>
          <BookmarkForm
            tripId={tripId}
            collections={collections}
            onDone={(saved) => {
              setAdding(false);
              if (saved) setOpen(true);
            }}
          />
        </UiDialog>
      )}
      <div
        id={embedded ? 'bookmarks-content' : undefined}
        data-open={!embedded || open}
        aria-hidden={embedded && !open}
        inert={embedded && !open}
        className="bookmarks-content"
      >
        <div className="bookmarks-content-inner">
          <div className="bookmarks-content-body">
            {items.length ? (
              <ul className="bookmark-grid">
                {items.map((item) => (
                  <BookmarkCard
                    key={item.id}
                    bookmark={item}
                    collections={collections}
                    tripId={tripId}
                    canEdit={canEdit}
                  />
                ))}
              </ul>
            ) : (
              <div className="empty">
                <h3>
                  {category || collection
                    ? 'No bookmarks match these filters.'
                    : 'Keep the good ideas here.'}
                </h3>
                <p>
                  {canEdit
                    ? 'Save a café, a place, a link, or a little “what if.”'
                    : 'Your group’s saved options will appear here.'}
                </p>
              </div>
            )}
            <details className="bookmark-tools" open={!embedded}>
              <summary>Organize bookmarks</summary>
              {canEdit && (
                <CollectionManager tripId={tripId} collections={collections} />
              )}
              <div className="bookmark-filters">
                <label>
                  Filter by category
                  <select
                    value={category ?? ''}
                    onChange={(e) =>
                      router.push(href(e.target.value, collection))
                    }
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option value={c} key={c}>
                        {categoryLabels[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Filter by collection
                  <select
                    value={collection ?? ''}
                    onChange={(e) =>
                      router.push(href(category, e.target.value))
                    }
                  >
                    <option value="">All bookmarks</option>
                    <option value="unfiled">Not in a collection</option>
                    {collections.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {(category || collection) && (
                  <Link href={path}>Clear filters</Link>
                )}
              </div>
            </details>
            {nextCursor && (
              <nav className="bookmark-pagination" aria-label="Bookmark pages">
                <Link href={href()}>First page</Link>
                {nextCursor && (
                  <Link href={href(category, collection, nextCursor)}>
                    Next page →
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

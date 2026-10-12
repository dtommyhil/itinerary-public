'use client';
import { useState } from 'react';
import type { CommentView } from '@/domain/discussion/contracts';
function commentStamp(value: string) {
  const date = new Date(value),
    today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const day =
    date.toDateString() === today.toDateString()
      ? 'Today'
      : date.toDateString() === yesterday.toDateString()
        ? 'Yesterday'
        : new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
          }).format(date);
  return `${day}, ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)}`;
}
export function CommentEntry({
  comment,
  busy,
  onChange,
  pending = false,
}: {
  comment: CommentView;
  busy: boolean;
  onChange: (id: string, method: string, data: unknown) => Promise<boolean>;
  pending?: boolean;
}) {
  const [editing, setEditing] = useState<{
    body: string;
    version: number;
  } | null>(null);
  return (
    <li
      className={`comment comment-entry${pending ? ' is-pending' : ''}`}
      aria-busy={pending}
    >
      <span className="initial" aria-hidden="true">
        {comment.author.slice(0, 1).toUpperCase()}
      </span>
      <div className="comment-content">
        <div className="comment-info">
          <strong className="author">{comment.author}</strong>
          <time className="stamp" dateTime={comment.createdAt}>
            {pending ? 'Sending…' : commentStamp(comment.createdAt)}
          </time>
          {comment.version > 0 && <span>Edited</span>}
        </div>
        {editing ? (
          <form
            aria-label="Edit comment"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = new FormData(e.currentTarget).get('body');
              if (
                await onChange(comment.id, 'PATCH', {
                  body,
                  version: editing.version,
                })
              )
                setEditing(null);
            }}
          >
            <label className="field">
              Edit comment
              <textarea
                aria-label="Edit comment"
                name="body"
                defaultValue={editing.body}
                maxLength={3000}
                required
                disabled={busy}
              />
            </label>
            <div className="comment-own">
              <button disabled={busy}>Save comment</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="comment-body">{comment.body}</p>
        )}
        {!editing && (
          <div className="comment-own">
            {comment.canEdit && (
              <button
                aria-label="Edit comment"
                disabled={busy}
                onClick={() =>
                  setEditing({ body: comment.body, version: comment.version })
                }
              >
                Edit
              </button>
            )}
            {comment.canDelete && (
              <button
                aria-label="Delete comment"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Remove this comment?'))
                    void onChange(comment.id, 'DELETE', {
                      version: comment.version,
                    });
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

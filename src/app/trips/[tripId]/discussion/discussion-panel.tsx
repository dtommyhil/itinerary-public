'use client';
import { notifySaved } from '@/app/components/ui-feedback';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import type { DiscussionTarget } from '@/domain/discussion/inputs';
import { Icon } from '../icons';
import type {
  DiscussionSummary,
  DiscussionView,
  VoteView,
  CommentView,
} from '@/domain/discussion/contracts';
import { CommentEntry } from './comment-entry';
import { useCardState } from '../../card-state';
import { requestJson, requestError } from './request';
export function DiscussionPanel({
  tripId,
  target,
  title,
  initial,
  expanded,
  onExpand,
  summary,
  children,
  plannedDays,
}: {
  tripId: string;
  target: DiscussionTarget;
  title: string;
  initial: DiscussionSummary;
  expanded: boolean;
  onExpand: () => void;
  summary: ReactNode;
  children?: ReactNode;
  plannedDays?: string[];
}) {
  const focusOnLoad = useRef(false);
  const commentInput = useRef<HTMLInputElement>(null);
  const commentTrigger = useRef<HTMLButtonElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [voteState, setVoteState] = useState(initial.votes);
  const [data, setData] = useState<DiscussionView>();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const reading = useRef(false);
  const dataSequence = useRef(0);
  const [loading, setLoading] = useState(false);
  const votingLock = useRef(false);
  const voteSequence = useRef(0);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState('');
  const [retryVote, setRetryVote] = useState<boolean | null>(null);
  const [receivedVotes, setReceivedVotes] = useState(initial.votes);
  const [localComments, setLocalComments] = useState<
    (CommentView & { pending: boolean })[]
  >([]);
  const [error, setError] = useState('');
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [cardState, updateCardState] = useCardState(
    `${target.resourceType}:${target.resourceId}`,
  );
  const body = cardState.draft;
  function setBody(change: string | ((current: string) => string)) {
    updateCardState((current) => ({
      draft: typeof change === 'function' ? change(current.draft) : change,
    }));
  }
  if (receivedVotes !== initial.votes) {
    setReceivedVotes(initial.votes);
    if (!voting) setVoteState(initial.votes);
  }
  const base = `/api/trips/${tripId}`;
  const loadOnOpen = useRef(() => {});
  useEffect(() => {
    loadOnOpen.current = () => {
      void refresh();
    };
  });
  useEffect(() => {
    if (expanded) loadOnOpen.current();
  }, [expanded, initial]);
  useEffect(() => {
    if (!expanded || !data || !focusOnLoad.current) return;
    let frame = 0;
    let attempts = 0;
    function cancel(event: PointerEvent) {
      if (!commentTrigger.current?.contains(event.target as Node))
        focusOnLoad.current = false;
    }
    function focus() {
      const input = commentInput.current;
      if (!focusOnLoad.current || !input) return;
      if (
        !input.closest('[inert]') &&
        getComputedStyle(input).visibility === 'visible'
      ) {
        input.focus({ preventScroll: true });
        if (document.activeElement === input) {
          focusOnLoad.current = false;
          document.removeEventListener('pointerdown', cancel);
          return;
        }
      }
      if (++attempts < 60) frame = requestAnimationFrame(focus);
    }
    document.addEventListener('pointerdown', cancel);
    frame = requestAnimationFrame(focus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', cancel);
    };
  }, [expanded, data, focusRequest]);
  async function load(cursor?: string) {
    const revision = dataSequence.current;
    const sequence = voteSequence.current;
    const query = new URLSearchParams({
      ...target,
      limit: String(
        cursor ? 3 : Math.min(50, Math.max(3, data?.items.length ?? 3)),
      ),
      ...(cursor ? { cursor } : {}),
    });
    const result = await requestJson<DiscussionView>(
      `${base}/comments?${query}`,
    );
    if (revision !== dataSequence.current) return;
    if (sequence === voteSequence.current && !votingLock.current)
      setVoteState(result.votes);
    setLocalComments((current) =>
      current.filter(
        (comment) => !result.items.some((saved) => saved.id === comment.id),
      ),
    );
    setData((current) => ({
      ...result,
      items:
        cursor && current
          ? [
              ...current.items,
              ...result.items.filter(
                (c) => !current.items.some((old) => old.id === c.id),
              ),
            ]
          : result.items,
    }));
  }
  async function refresh(cursor?: string) {
    if (working.current || reading.current) return;
    reading.current = true;
    const revision = dataSequence.current;
    setLoading(true);
    setError('');
    try {
      await load(cursor);
    } catch (error) {
      if (revision === dataSequence.current) setError(requestError(error));
    } finally {
      reading.current = false;
      setLoading(false);
    }
  }
  async function change(id: string, method: string, fields: unknown) {
    if (working.current) return false;
    working.current = true;
    dataSequence.current++;
    setBusy(true);
    setError('');
    setRetryAction(null);
    const previous = data;
    const text = String((fields as { body?: unknown }).body ?? '');
    const temporaryId = !id ? `pending-${crypto.randomUUID()}` : null;
    if (temporaryId) {
      const now = new Date().toISOString();
      setLocalComments((current) => [
        ...current,
        {
          id: temporaryId,
          body: text,
          author: 'You',
          version: 0,
          createdAt: now,
          updatedAt: now,
          canEdit: false,
          canDelete: false,
          pending: true,
        },
      ]);
      setBody((current) => (current === text ? '' : current));
    } else {
      setData(
        (current) =>
          current && {
            ...current,
            total:
              method === 'DELETE'
                ? Math.max(0, current.total - 1)
                : current.total,
            items:
              method === 'DELETE'
                ? current.items.filter((comment) => comment.id !== id)
                : current.items.map((comment) =>
                    comment.id === id ? { ...comment, body: text } : comment,
                  ),
          },
      );
    }
    let saved = false;
    try {
      const result = await requestJson<{ id: string }>(
        `${base}/comments${id ? `/${id}` : ''}`,
        method,
        fields,
      );
      saved = true;
      if (temporaryId)
        setLocalComments((current) =>
          current.map((comment) =>
            comment.id === temporaryId
              ? { ...comment, id: result.id, pending: false }
              : comment,
          ),
        );
      notifySaved(
        method === 'DELETE'
          ? 'Comment deleted'
          : id
            ? 'Comment updated'
            : 'Comment posted',
      );
      await load();
    } catch (error) {
      if (!saved) {
        if (temporaryId) {
          setLocalComments((current) =>
            current.filter((comment) => comment.id !== temporaryId),
          );
          setBody((current) => current || text);
        } else setData(previous);
      }
      setError(
        `${saved ? 'Saved, but could not refresh. ' : ''}${requestError(error)}`,
      );
      if (saved) setRetryAction(() => () => void refresh());
      else if (!id || method === 'DELETE')
        setRetryAction(() => () => void change(id, method, fields));
    } finally {
      working.current = false;
      setBusy(false);
    }
    return saved;
  }
  async function vote(desired = !voteState.mine) {
    if (votingLock.current || !voteState.canVote || !initial.votes.canVote)
      return;
    votingLock.current = true;
    voteSequence.current++;
    setVoting(true);
    setVoteError('');
    setRetryVote(null);
    const previous = voteState;
    setVoteState({
      ...previous,
      mine: desired,
      count: Math.max(
        0,
        previous.count + (desired === previous.mine ? 0 : desired ? 1 : -1),
      ),
    });
    try {
      const result = await requestJson<VoteView>(`${base}/votes`, 'POST', {
        ...target,
        value: desired ? 1 : 0,
      });
      setVoteState(result);
    } catch (error) {
      setVoteState(previous);
      setVoteError(requestError(error));
      setRetryVote(desired);
    } finally {
      votingLock.current = false;
      setVoting(false);
    }
  }
  return (
    <div className="card-discussion" aria-label={`Discussion for ${title}`}>
      <div className={`card${expanded ? ' expanded' : ''}`}>
        {summary}
        <div className="card-detail" aria-hidden={!expanded} inert={!expanded}>
          <div className="card-detail-inner">
            <div className="card-detail-body">
              {children}
              <section
                className="discussion"
                aria-label={`Discussion for ${title}`}
              >
                <h4>Discussion</h4>
                {data?.nextCursor && (
                  <button
                    className="view-more"
                    disabled={busy}
                    onClick={() => void refresh(data.nextCursor!)}
                  >
                    View more comments (
                    {Math.max(0, data.total - data.items.length)})
                  </button>
                )}
                {loading && !data && (
                  <p className="hint" role="status">
                    Loading discussion…
                  </p>
                )}
                {data && (
                  <>
                    <ul className="comment-list">
                      {data.items.toReversed().map((comment) => (
                        <CommentEntry
                          key={comment.id}
                          comment={{
                            ...comment,
                            canEdit: comment.canEdit && initial.votes.canVote,
                            canDelete:
                              comment.canDelete && initial.votes.canVote,
                          }}
                          busy={busy}
                          onChange={change}
                        />
                      ))}
                      {localComments.map((comment) => (
                        <CommentEntry
                          key={comment.id}
                          comment={comment}
                          pending={comment.pending}
                          busy
                          onChange={change}
                        />
                      ))}
                    </ul>
                    {!data.items.length && !localComments.length && (
                      <p className="hint">Start the conversation.</p>
                    )}
                    {data.canComment && initial.votes.canVote ? (
                      <form
                        className="comment-form comment-composer"
                        aria-label={`Comment on ${title}`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void change('', 'POST', { ...target, body });
                        }}
                      >
                        <input
                          ref={commentInput}
                          aria-label="Your comment"
                          placeholder="Add a comment…"
                          value={body}
                          onChange={(event) => setBody(event.target.value)}
                          required
                          maxLength={3000}
                          autoComplete="off"
                        />
                        <button
                          className="icon"
                          aria-label="Post comment"
                          disabled={busy || !body.trim()}
                        >
                          <Icon name="send" />
                        </button>
                      </form>
                    ) : (
                      <p className="hint">
                        You have view-only access to this discussion.
                      </p>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
      <div className="action-row card-reactions">
        <button
          className="action"
          type="button"
          disabled={voting || !voteState.canVote || !initial.votes.canVote}
          aria-busy={voting}
          aria-label={voteState.mine ? 'Remove my vote' : 'I’m interested'}
          aria-pressed={voteState.mine}
          onClick={() => void vote()}
        >
          <Icon name="like" />
          <span>{voteState.count}</span>
        </button>
        <button
          ref={commentTrigger}
          className="action"
          type="button"
          aria-label={`Comments for ${title}`}
          aria-expanded={expanded}
          onClick={() => {
            focusOnLoad.current = true;
            setFocusRequest((request) => request + 1);
            onExpand();
          }}
        >
          <Icon name="comment" />
          <span>
            {(data?.total ?? initial.comments) + localComments.length}
          </span>
        </button>
        {plannedDays?.length ? (
          <span className="planned">
            <Icon name="check" />
            Planned for{' '}
            {new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${plannedDays[0]}T12:00:00Z`))}
            {plannedDays.length > 1 ? ` +${plannedDays.length - 1}` : ''}
            <span className="sr-only">
              {plannedDays.map((date) => `Planned for ${date}`).join(', ')}
            </span>
          </span>
        ) : null}
        <span className="sr-only">{voteState.count} interested</span>
      </div>
      {voteError && (
        <div className="discussion-feedback">
          <p role="alert" className="form-error">
            {voteError}
          </p>
          {retryVote !== null && (
            <button
              className="text-button"
              disabled={voting}
              onClick={() => void vote(retryVote)}
            >
              Retry vote
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="discussion-feedback">
          <p role="alert" className="form-error">
            {error}
          </p>
          {retryAction && (
            <button
              className="text-button"
              disabled={busy || voting}
              onClick={retryAction}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

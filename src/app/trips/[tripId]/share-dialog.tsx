'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icons';
import { z } from 'zod';
import type { TripRole } from '@/domain/trips/policies';
type Member = {
  userId: string;
  role: TripRole;
  user: { name: string; email?: string };
};
type Invitation = { id: string; email: string; role: TripRole };
const labels = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };
export function ShareDialog({
  tripId,
  tripName,
  members,
  invitations,
  role,
  userId,
}: {
  tripId: string;
  tripName: string;
  members: Member[];
  invitations: Invitation[];
  role: TripRole;
  userId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [readLink, setReadLink] = useState('');
  const [emails, setEmails] = useState('');
  const base = `/api/trips/${tripId}`;
  async function send(path: string, method: string, body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message ?? 'Unable to update sharing');
    return data;
  }
  async function action(
    path: string,
    method: string,
    body?: unknown,
    leave = false,
  ) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await send(path, method, body);
      if (path.endsWith('/read-link') && method === 'DELETE') setReadLink('');
      setMessage(
        result.delivered === false
          ? 'Invitation saved, but email delivery failed. The recipient can still find it on their Trips page.'
          : 'Sharing updated.',
      );
      if (leave) {
        dialog.current?.close();
        router.push('/trips');
      }
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        id="share-trip"
        aria-label="Share trip"
        className="icon share-trigger"
        onClick={() => {
          setMessage('');
          dialog.current?.showModal();
        }}
        aria-haspopup="dialog"
      >
        <Icon name="share" />
      </button>
      <dialog
        ref={dialog}
        className="share-dialog"
        aria-labelledby="share-title"
        aria-describedby="share-trip-name"
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              event.currentTarget.close();
          }
        }}
      >
        <div className="dialog-inner">
          <div className="dialog-heading">
            <div>
              <h2 id="share-title">Share this trip</h2>
              <p id="share-trip-name" className="sr-only">
                {tripName}
              </p>
            </div>
            <button
              className="icon"
              aria-label="Close sharing"
              onClick={() => dialog.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="sharing-body" aria-busy={busy}>
            {role !== 'viewer' ? (
              <form
                className="invite"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy) return;
                  const data = new FormData(event.currentTarget);
                  const targets = [
                    ...new Set(
                      emails
                        .split(',')
                        .map((value) => value.trim().toLowerCase())
                        .filter(Boolean),
                    ),
                  ];
                  if (
                    !targets.length ||
                    targets.length > 20 ||
                    targets.some(
                      (email) => !z.email().max(320).safeParse(email).success,
                    )
                  ) {
                    setMessage(
                      'Enter up to 20 valid email addresses, separated by commas.',
                    );
                    return;
                  }
                  setBusy(true);
                  setMessage('');
                  const failed: string[] = [];
                  let saved = 0;
                  let undelivered = 0;
                  const errors: string[] = [];
                  try {
                    for (const email of targets) {
                      try {
                        const result = await send(
                          `${base}/invitations`,
                          'POST',
                          {
                            email,
                            role: data.get('role'),
                          },
                        );
                        saved++;
                        if (result.delivered === false) undelivered++;
                      } catch (error) {
                        failed.push(email);
                        errors.push(
                          `${email}: ${error instanceof Error ? error.message : 'Unable to send'}`,
                        );
                      }
                    }
                    setEmails(failed.join(', '));
                    setMessage(
                      [
                        saved
                          ? `${saved} invitation${saved === 1 ? '' : 's'} saved.`
                          : '',
                        undelivered
                          ? `${undelivered} email delivery failed; invitations are available on the recipients’ Trips pages.`
                          : '',
                        ...errors,
                      ]
                        .filter(Boolean)
                        .join(' '),
                    );
                    router.refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="sr-only" htmlFor="share-emails">
                  Email addresses
                </label>
                <input
                  id="share-emails"
                  name="email"
                  inputMode="email"
                  value={emails}
                  onChange={(event) => setEmails(event.target.value)}
                  placeholder="Email address"
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy}
                />
                <label className="sr-only" htmlFor="share-invite-role">
                  Trip role
                </label>
                <select
                  id="share-invite-role"
                  name="role"
                  defaultValue="editor"
                  disabled={busy}
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button className="button" disabled={busy}>
                  Invite
                </button>
              </form>
            ) : (
              <p className="hint">
                Owners and editors can invite people. Only the owner can change
                or remove access.
              </p>
            )}
            <p className="share-status" role="status">
              {message}
            </p>
            <div className="members">
              <h3>People on this trip</h3>
              <ul className="share-people" aria-label="People with access">
                {members.map((member) => (
                  <li className="member" key={member.userId}>
                    <span className="initial" aria-hidden="true">
                      {Array.from(member.user.name.trim())[0]?.toUpperCase() ??
                        '?'}
                    </span>
                    <div className="person">
                      <p>
                        {member.user.name}{' '}
                        {member.userId === userId && <span>(You)</span>}
                      </p>
                      {member.user.email && <small>{member.user.email}</small>}
                    </div>
                    {role === 'owner' && member.role !== 'owner' ? (
                      <select
                        aria-label={`Access for ${member.user.name}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => {
                          const choice = event.target.value;
                          if (choice === 'remove' || choice === 'transfer') {
                            const prompt =
                              choice === 'remove'
                                ? `Remove ${member.user.name} from this trip? This also disables the current read-only invitation link.`
                                : `Make ${member.user.name} the owner? You will become an editor.`;
                            if (!window.confirm(prompt)) return;
                            void action(`${base}/members`, 'POST', {
                              action: choice,
                              userId: member.userId,
                            });
                          } else
                            void action(`${base}/members`, 'POST', {
                              action: 'role',
                              userId: member.userId,
                              role: choice,
                            });
                        }}
                      >
                        <option value="editor">Can edit</option>
                        <option value="viewer">Can view</option>
                        <option value="transfer">Transfer ownership…</option>
                        <option value="remove">Remove access…</option>
                      </select>
                    ) : (
                      <span className="role-label">{labels[member.role]}</span>
                    )}
                  </li>
                ))}
              </ul>
              {role === 'owner' && invitations.length > 0 && (
                <>
                  <h3 className="sharing-heading">Pending invitations</h3>
                  <ul className="share-people">
                    {invitations.map((invite) => (
                      <li className="member" key={invite.id}>
                        <span className="initial" aria-hidden="true">
                          ✉
                        </span>
                        <div className="person">
                          <p>{invite.email}</p>
                          <small>Invited · {labels[invite.role]}</small>
                        </div>
                        <details className="invite-actions">
                          <summary
                            aria-label={`Manage invitation for ${invite.email}`}
                          >
                            Manage
                          </summary>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(`${base}/invitations`, 'POST', {
                                email: invite.email,
                                role: invite.role,
                              })
                            }
                          >
                            Resend
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(
                                `${base}/invitations/${invite.id}`,
                                'DELETE',
                              )
                            }
                          >
                            Revoke
                          </button>
                        </details>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="sharing-link">
              <h3 className="sharing-heading">Read-only invitation link</h3>
              <div className="link-box">
                {readLink ? (
                  <>
                    <input
                      className="read-link-value"
                      aria-label="Read-only link"
                      readOnly
                      value={readLink}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(readLink);
                          setMessage('Read-only link copied.');
                        } catch {
                          setMessage(
                            'Select and copy the read-only link above.',
                          );
                        }
                      }}
                    >
                      Copy link
                    </button>
                  </>
                ) : (
                  <>
                    <code>
                      {role === 'viewer'
                        ? 'Ask an owner or editor for a link'
                        : 'Create an invitation link'}
                    </code>
                    {role !== 'viewer' && (
                      <button
                        disabled={busy}
                        aria-label="Create read-only link"
                        onClick={async () => {
                          if (busy) return;
                          setBusy(true);
                          setMessage('');
                          try {
                            const result = await send(
                              `${base}/read-link`,
                              'POST',
                            );
                            setReadLink(
                              `${window.location.origin}${result.path}`,
                            );
                            setMessage(
                              'Read-only link created. Copy it above.',
                            );
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : 'Unable to create link',
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Create link
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="hint">
                Sign-in required · Can view · Expires in 7 days
                <br />
                Existing members keep their current access. Creating a link
                replaces the previous one.
              </p>
              {role === 'owner' && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void action(`${base}/read-link`, 'DELETE')}
                >
                  Disable read-only link
                </button>
              )}
            </div>
          </div>
          <details className="sharing-extras">
            <summary>More sharing options</summary>
            <div className="share-footer">
              {role !== 'owner' ? (
                <button
                  className="text-action"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Leave this trip? You’ll need a new invitation to rejoin.',
                      )
                    )
                      void action(
                        `${base}/members`,
                        'POST',
                        { action: 'leave' },
                        true,
                      );
                  }}
                >
                  Leave trip
                </button>
              ) : (
                <span className="hint">Invitations expire after 7 days.</span>
              )}
              <div className="share-link-actions">
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/trips/${tripId}`;
                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: 'Plan a trip with itinerary',
                          url,
                        });
                      } else {
                        await navigator.clipboard.writeText(url);
                        setMessage(
                          'Link copied. Only trip members can open it.',
                        );
                      }
                    } catch (error) {
                      if (error instanceof Error && error.name === 'AbortError')
                        return;
                      setMessage(
                        'Unable to share. Try Copy link, or copy the trip URL from your address bar.',
                      );
                    }
                  }}
                >
                  Share link
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/trips/${tripId}`,
                      );
                      setMessage('Link copied. Only trip members can open it.');
                    } catch {
                      setMessage(
                        'Unable to copy. You can copy the trip URL from your address bar.',
                      );
                    }
                  }}
                >
                  Copy link
                </button>
              </div>
            </div>
          </details>
        </div>
      </dialog>
    </>
  );
}

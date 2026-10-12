'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { TripRole } from '@/domain/trips/policies';

export function TripPeople({
  members,
  userId,
  role,
}: {
  members: {
    userId: string;
    role: TripRole;
    user: { name: string; email?: string };
  }[];
  userId: string;
  role: TripRole;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const dismissed = useRef(false);
  const group = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!group.current?.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
        dismissed.current = true;
      }
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return (
    <div
      className="people-group"
      ref={group}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && !dismissed.current) setOpen(true);
      }}
      onPointerLeave={() => {
        if (!pinned) setOpen(false);
        dismissed.current = false;
      }}
      onFocus={() => {
        if (!dismissed.current) setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setPinned(false);
          dismissed.current = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          setPinned(false);
          dismissed.current = true;
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="group people-trigger"
        aria-label="People on this trip"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
          dismissed.current = pinned;
        }}
      >
        <span className="avatar-stack" aria-hidden="true">
          {members.slice(0, 4).map((member) => (
            <span className="avatar" key={member.userId}>
              {Array.from(member.user.name)[0]?.toUpperCase() ?? '?'}
            </span>
          ))}
        </span>
        <span className="member-caption">
          {members.length} {members.length === 1 ? 'person' : 'people'}
          {role === 'viewer' ? ' · Can view' : ''}
        </span>
      </button>
      <div
        id={id}
        className="people-popover"
        role="region"
        aria-label="People on this trip"
        hidden={!open}
      >
        <div className="people-panel">
          <h3>People on this trip</h3>
          <ul className="people-list">
            {members.map((member) => (
              <li className="member" key={member.userId}>
                <span className="initial" aria-hidden="true">
                  {Array.from(member.user.name)[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="person">
                  <span className="people-name">
                    {member.user.name}
                    {member.userId === userId && ' (you)'}
                  </span>
                  {member.user.email && <small>{member.user.email}</small>}
                </span>
                <span className="role-label">
                  {member.role === 'owner'
                    ? 'Owner'
                    : member.role === 'editor'
                      ? 'Can edit'
                      : 'Can view'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './[tripId]/icons';

export function CardActions({
  title,
  busy,
  actions,
}: {
  title: string;
  busy?: boolean;
  actions: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return (
    <div
      className="card-actions-menu"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        className="icon card-menu-trigger"
        type="button"
        ref={trigger}
        aria-label={`Actions for ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div
          id={id}
          role="group"
          className="card-action-options"
          aria-label={`Actions for ${title}`}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.danger ? 'danger-text' : undefined}
              disabled={action.disabled || busy}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus({ preventScroll: true });
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

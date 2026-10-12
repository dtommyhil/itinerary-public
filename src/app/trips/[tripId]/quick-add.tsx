'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const triggerButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  function add(id: string) {
    setOpen(false);
    const trigger = document.getElementById(id);
    if (trigger?.tagName === 'SUMMARY') {
      const details = trigger.closest('details');
      if (details) details.open = true;
      details?.querySelector<HTMLInputElement>('input')?.focus();
    } else if (trigger?.getAttribute('aria-expanded') !== 'true')
      trigger?.click();
  }
  return (
    <div
      className="floating trip-quick-add"
      ref={menu}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          triggerButton.current?.focus();
        }
      }}
    >
      {open && (
        <div className="add-menu quick-add-options">
          <button onClick={() => add('add-activity')}>
            <Icon name="star" />
            Add activity
          </button>
          <button onClick={() => add('add-bookmark')}>
            <Icon name="bookmark" />
            Add bookmark
          </button>
        </div>
      )}
      <button
        className="fab quick-add-trigger"
        ref={triggerButton}
        aria-label="Add to trip"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'close' : 'plus'} width={26} height={26} />
      </button>
    </div>
  );
}

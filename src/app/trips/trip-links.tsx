'use client';
import { useRef, useState } from 'react';
import type { TripLink } from '@/domain/trips/links';
import { Icon } from './[tripId]/icons';

export function linksFromForm(data: FormData): TripLink[] {
  return data.getAll('tripLinkUrl').map((url, index) => ({
    url: String(url),
    label: String(data.getAll('tripLinkLabel')[index] ?? ''),
  }));
}
export function TripLinks({
  links = [],
  busy,
}: {
  links?: TripLink[];
  busy: boolean;
}) {
  const [rows, setRows] = useState(() =>
    links.map((link, id) => ({ ...link, id })),
  );
  const container = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [nextId, setNextId] = useState(links.length);
  return (
    <section ref={container} className="draft-links" aria-label="Trip links">
      {rows.map((link) => (
        <div className="trip-link-row" key={link.id}>
          <div className="link-row-heading">
            <span>Link</span>
            <button
              type="button"
              className="icon"
              aria-label={`Remove link ${link.label || link.id + 1}`}
              disabled={busy}
              onClick={() => {
                setRows(rows.filter((row) => row.id !== link.id));
                requestAnimationFrame(() => addButton.current?.focus());
              }}
            >
              <Icon name="close" />
            </button>
          </div>
          <label className="field">
            Name · optional
            <input
              name="tripLinkLabel"
              maxLength={100}
              defaultValue={link.label}
              placeholder="e.g. Shared photo album"
              disabled={busy}
            />
          </label>
          <label className="field">
            HTTPS link
            <input
              name="tripLinkUrl"
              type="url"
              pattern="https://.*"
              required
              maxLength={4096}
              defaultValue={link.url}
              placeholder="https://…"
              disabled={busy}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        ref={addButton}
        className="text-button add-trip-link"
        disabled={busy}
        onClick={() => {
          setRows([...rows, { id: nextId, label: '', url: '' }]);
          setNextId(nextId + 1);
          requestAnimationFrame(() => {
            const inputs =
              container.current?.querySelectorAll<HTMLInputElement>(
                'input[name="tripLinkLabel"]',
              );
            inputs?.[inputs.length - 1]?.focus();
          });
        }}
      >
        <Icon name="plus" />
        Add link
      </button>
    </section>
  );
}

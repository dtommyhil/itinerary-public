'use client';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { InlineField } from '../inline-field';

export function CardToggle({
  title,
  notes,
  expanded,
  onToggle,
  onSaveTitle,
  onSaveNotes,
  busy,
  tools,
  revision,
  titleLabel = 'Activity title',
}: {
  title: string;
  notes: string | null;
  expanded: boolean;
  onToggle: () => void;
  revision?: number;
  onSaveTitle?: (value: string, revision?: number) => Promise<boolean>;
  onSaveNotes?: (value: string, revision?: number) => Promise<boolean>;
  busy?: boolean;
  tools?: ReactNode;
  titleLabel?: string;
}) {
  return (
    <div className="card-top">
      <div className="card-toggle">
        <div className="card-summary">
          {onSaveTitle ? (
            <InlineField
              revision={revision}
              heading
              className="card-title-inline"
              label={titleLabel}
              value={title}
              required
              disabled={busy}
              onSave={onSaveTitle}
            />
          ) : (
            <h3>
              <button className="card-title-toggle" onClick={onToggle}>
                {title}
              </button>
            </h3>
          )}
          {onSaveNotes && (
            <div hidden={!expanded} inert={!expanded}>
              <InlineField
                className={expanded ? 'preview card-preview' : 'preview'}
                value={notes ?? ''}
                label="Notes"
                placeholder="Add a note for the group…"
                revision={revision}
                multiline
                maxLength={5000}
                disabled={busy}
                onSave={onSaveNotes}
              />
            </div>
          )}
          {(!expanded || !onSaveNotes) && (
            <button className="preview card-preview" onClick={onToggle}>
              {notes || 'Details and discussion'}
            </button>
          )}
        </div>
      </div>
      <div className="card-controls">
        <button
          className="icon card-disclosure"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="chevron">
            <Icon name="chevron" />
          </span>
        </button>
        {tools}
      </div>
    </div>
  );
}

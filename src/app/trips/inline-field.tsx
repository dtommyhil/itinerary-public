'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './[tripId]/icons';

export function InlineField({
  value,
  label,
  placeholder = 'Add a note…',
  multiline = false,
  maxLength = 200,
  required = false,
  disabled = false,
  className = '',
  heading = false,
  type = 'text',
  displayValue,
  onSave,
  revision,
}: {
  value: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  heading?: boolean;
  type?: 'text' | 'time';
  displayValue?: string;
  revision?: number;
  onSave: (value: string, revision?: number) => Promise<boolean>;
}) {
  const [editingRevision, setEditingRevision] = useState(revision);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const view = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && !disabled && restoreFocus.current && view.current) {
      view.current.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [editing, disabled]);
  function finish() {
    if (form.current?.contains(document.activeElement))
      restoreFocus.current = true;
    setEditing(false);
  }
  async function save() {
    if (
      inFlight.current ||
      disabled ||
      (revision !== undefined && revision !== editingRevision)
    )
      return;
    const next = draft.trim();
    if (required && !next) {
      setError('This field cannot be empty.');
      return;
    }
    if (next === value && editingRevision === revision) {
      finish();
      return;
    }
    inFlight.current = true;
    restoreFocus.current = Boolean(
      form.current?.contains(document.activeElement),
    );
    setSaving(true);
    setError('');
    try {
      if (await onSave(next, editingRevision)) finish();
      else setError('Couldn’t save. Your edit is still here.');
    } catch {
      setError('Couldn’t save. Your edit is still here.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  if (!editing) {
    const button = (
      <button
        type="button"
        ref={view}
        className={`inline-value ${className}`}
        aria-label={`Edit ${label.toLowerCase()} inline`}
        disabled={disabled}
        title="Click to edit"
        onClick={() => {
          setEditingRevision(revision);
          setDraft(value);
          setError('');
          setEditing(true);
        }}
      >
        {(value && (displayValue ?? value)) || (
          <span className="inline-placeholder">{placeholder}</span>
        )}
      </button>
    );
    return heading ? <h3 aria-label={value}>{button}</h3> : button;
  }
  const field = {
    'aria-label': label,
    value: draft,
    maxLength,
    required,
    autoFocus: true,
    readOnly: saving,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setDraft(event.target.value);
      setError('');
    },
  };
  return (
    <form
      ref={form}
      className={`inline-editor ${className}`}
      aria-label={`Edit ${label.toLowerCase()} inline`}
      aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          restoreFocus.current = false;
        if (!event.currentTarget.contains(event.relatedTarget) && !error)
          void save();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !saving) {
          event.preventDefault();
          event.stopPropagation();
          finish();
        }
      }}
    >
      {multiline ? (
        <textarea {...field} rows={3} />
      ) : (
        <input {...field} type={type} />
      )}
      {revision !== undefined && editingRevision !== revision && (
        <div className="edit-conflict" role="alert">
          <p>
            This field changed. Latest saved: {value || '(empty)'}. Your draft
            is still here.
          </p>
          <button
            type="button"
            className="subtle"
            onClick={() => {
              setDraft(value);
              setEditingRevision(revision);
              setError('');
            }}
          >
            Use latest value
          </button>
          <button
            type="button"
            className="subtle"
            onClick={() => {
              setEditingRevision(revision);
              setError('');
            }}
          >
            Keep my draft
          </button>
        </div>
      )}
      <div className="inline-editor-actions">
        <span className="inline-save-status" aria-live="polite">
          {saving ? 'Saving…' : error}
        </span>
        <button
          className="icon"
          disabled={saving || disabled}
          aria-label={error ? 'Retry saving' : 'Save edit'}
        >
          <Icon name="check" />
        </button>
        <button
          type="button"
          className="icon"
          disabled={saving}
          aria-label="Cancel edit"
          onClick={finish}
        >
          <Icon name="close" />
        </button>
      </div>
    </form>
  );
}

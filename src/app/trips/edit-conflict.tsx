'use client';
export function EditConflict({
  fields,
  onUseLatest,
  onKeepDraft,
}: {
  fields: { label: string; draft: string; latest: string }[];
  onUseLatest: () => void;
  onKeepDraft: () => void;
}) {
  const changes = fields.filter((f) => f.draft !== f.latest);
  return (
    <section className="edit-conflict" aria-label="Review changed details">
      <p>
        Review the latest saved values before continuing. Keeping your draft
        means your next save will replace these values.
      </p>
      {changes.length ? (
        <dl>
          {changes.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>
                <strong>Your draft</strong>
                <pre>{f.draft || '(empty)'}</pre>
                <strong>Latest saved</strong>
                <pre>{f.latest || '(empty)'}</pre>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>The latest values match your draft.</p>
      )}
      <div className="row">
        <button type="button" className="subtle" onClick={onUseLatest}>
          Use latest values
        </button>
        <button type="button" className="subtle" onClick={onKeepDraft}>
          Keep my draft
        </button>
      </div>
    </section>
  );
}

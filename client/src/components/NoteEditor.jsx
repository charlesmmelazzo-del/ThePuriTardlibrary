import { useState } from 'react';

export default function NoteEditor({ initial = '', onSave, onCancel, saveLabel = 'Save note' }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="note-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        setError('');
        try {
          await onSave(body.trim());
        } catch (err) {
          setError(err.message);
          setBusy(false);
        }
      }}
    >
      <textarea
        autoFocus
        rows={3}
        placeholder="Write a personal note on this paragraph…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Note"
      />
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary small" disabled={busy || !body.trim()}>
          {busy ? 'Saving…' : saveLabel}
        </button>
        <button type="button" className="btn small ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

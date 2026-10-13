import { useState } from 'react';

export default function NoteEditor({ initial = '', onSave, onCancel, saveLabel = 'Save note', groups = [] }) {
  const [body, setBody] = useState(initial);
  const [groupId, setGroupId] = useState('');
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
          await onSave(body.trim(), groupId ? Number(groupId) : null);
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
      {groups.length > 0 && (
        <label className="inline small">
          Visible to
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Only me (private)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                My group: {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
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

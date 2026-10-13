import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDateTime } from '../lib/api.js';
import NoteEditor from '../components/NoteEditor.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import Icon from '../components/Icon.jsx';

export default function Notes() {
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [bookId, setBookId] = useState('');
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);

  useEffect(() => {
    api('/notes').then((d) => setNotes(d.notes)).catch((e) => setError(e.message));
  }, []);

  const books = useMemo(() => {
    const m = new Map();
    for (const n of notes || []) m.set(n.book_id, n.book_title);
    return [...m];
  }, [notes]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (notes || []).filter(
      (n) =>
        (!bookId || String(n.book_id) === bookId) &&
        (!f || `${n.body} ${n.modern} ${n.original}`.toLowerCase().includes(f)),
    );
  }, [notes, filter, bookId]);

  const grouped = useMemo(() => {
    const m = new Map();
    for (const n of shown) {
      if (!m.has(n.book_id)) m.set(n.book_id, { title: n.book_title, author: n.book_author, notes: [] });
      m.get(n.book_id).notes.push(n);
    }
    return [...m];
  }, [shown]);

  return (
    <div className="page">
      <div className="toolbar">
        <h1>My notes</h1>
        <div className="toolbar-controls">
          <input type="search" placeholder="Filter notes" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter notes" />
          {books.length > 1 && (
            <select value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="Book">
              <option value="">All books</option>
              {books.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!notes && !error && <p className="muted">Loading…</p>}
      {notes && notes.length === 0 && (
        <div className="empty">
          <p>You haven't written any notes yet. While reading, tap <strong>Note</strong> under any paragraph to add one.</p>
        </div>
      )}
      {grouped.map(([id, g]) => (
        <section key={id} className="notes-group">
          <h2>
            <Link to={`/books/${id}`}>{g.title}</Link> <span className="muted small">{g.author}</span>
          </h2>
          {g.notes.map((n) => (
            <div key={n.id} className="card note-card">
              <blockquote className="note-quote">{n.modern || n.original}</blockquote>
              <div className="muted small">
                {n.chapter_title}
                {n.section_title ? ` › ${n.section_title}` : ''}
              </div>
              {editing === n.id ? (
                <NoteEditor
                  initial={n.body}
                  onCancel={() => setEditing(null)}
                  onSave={async (body) => {
                    const { note } = await api(`/notes/${n.id}`, { method: 'PATCH', body: { body } });
                    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, body: note.body, updated_at: note.updated_at } : x)));
                    setEditing(null);
                  }}
                />
              ) : (
                <p className="note-body">{n.body}</p>
              )}
              {n.group_name && (
                <div className="small muted">
                  <Icon name="users" size={13} /> Shared with {n.group_name}
                </div>
              )}
              <div className="note-meta">
                <span className="muted small">{formatDateTime(n.updated_at)}</span>
                <Link className="link-btn" to={`/read/${n.book_id}/${n.section_id}#p-${n.paragraph_id}`}>
                  Open in book
                </Link>
                <button className="link-btn" onClick={() => setEditing(n.id)}>
                  Edit
                </button>
                <button
                  className="link-btn"
                  onClick={() =>
                    setSharing({
                      paragraph: { original: n.original, modern: n.modern },
                      source: { title: n.book_title, author: n.book_author, chapter: n.chapter_title, section: n.section_title },
                    })
                  }
                >
                  Share excerpt
                </button>
                <button
                  className="link-btn danger"
                  onClick={async () => {
                    if (!confirm('Delete this note?')) return;
                    await api(`/notes/${n.id}`, { method: 'DELETE' });
                    setNotes((all) => all.filter((x) => x.id !== n.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      ))}
      {sharing && <ShareSheet paragraph={sharing.paragraph} source={sharing.source} onClose={() => setSharing(null)} />}
    </div>
  );
}

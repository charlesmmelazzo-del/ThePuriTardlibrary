import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatDateTime } from '../../lib/api.js';
import { useApp } from '../../lib/auth.jsx';
import Cover from '../../components/Cover.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';

function downloadJson(filename, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api('/admin/stats').then(setStats).catch(() => {});
  }, []);
  return (
    <>
      <div className="stat-grid">
        {stats &&
          [
            ['Readers', stats.users],
            ['Active this week', stats.active_readers_7d],
            ['Books', stats.books],
            ['Paragraphs', stats.paragraphs],
            ['Notes written', stats.notes],
            ['Reading goals', stats.goals],
          ].map(([label, n]) => (
            <div className="card stat" key={label}>
              <div className="stat-n">{n.toLocaleString()}</div>
              <div className="muted small">{label}</div>
            </div>
          ))}
      </div>
      <section className="card">
        <h2>Adding books with an AI assistant or a script</h2>
        <p>
          Anyone with the admin email and password can add books through the API. Log in with <code>POST /api/auth/login</code>, then send
          the returned token as <code>Authorization: Bearer &lt;token&gt;</code> to <code>POST /api/admin/books</code> with the book as
          JSON. The format and every endpoint are described in <code>docs/ADMIN_API.md</code> in the code repository, and{' '}
          <code>npm run import-book -- book.json</code> does it in one step.
        </p>
      </section>
    </>
  );
}

function Books() {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api('/admin/books').then((d) => setBooks(d.books)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="toolbar">
        <h2>Books ({books?.length ?? '…'})</h2>
        <Link className="btn primary" to="/admin/books/new">
          <Icon name="plus" size={18} /> Add a book
        </Link>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>Title</th>
              <th>Author</th>
              <th>Year</th>
              <th>Contents</th>
              <th>Readers</th>
              <th>Visible</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {books?.map((b) => (
              <tr key={b.id}>
                <td>
                  <Cover book={b} size="xs" />
                </td>
                <td>
                  <Link to={`/books/${b.id}`}>{b.title}</Link>
                </td>
                <td>{b.author}</td>
                <td>{b.year ?? '—'}</td>
                <td className="small">
                  {b.chapter_count} ch · {b.section_count} sec · {b.paragraph_count} ¶
                </td>
                <td>{b.reader_count}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={b.published}
                    aria-label="Visible to readers"
                    onChange={async (e) => {
                      await api(`/admin/books/${b.id}`, { method: 'PUT', body: { published: e.target.checked } });
                      load();
                    }}
                  />
                </td>
                <td className="actions">
                  <Link className="btn small" to={`/admin/books/${b.id}`}>
                    <Icon name="edit" size={16} /> Edit
                  </Link>
                  <button
                    className="btn small ghost"
                    title="Download as JSON"
                    onClick={async () => {
                      const { book } = await api(`/admin/books/${b.id}`);
                      downloadJson(`${b.title.replace(/[^\w]+/g, '-').toLowerCase()}.json`, book);
                    }}
                  >
                    <Icon name="download" size={16} />
                  </button>
                  <button
                    className="btn small ghost danger"
                    title="Delete book"
                    onClick={async () => {
                      const typed = prompt(
                        `Delete “${b.title}”? This also removes every reader's notes, progress and goals for it.\n\nType DELETE to confirm.`,
                      );
                      if (typed !== 'DELETE') return;
                      await api(`/admin/books/${b.id}`, { method: 'DELETE' });
                      load();
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {books?.length === 0 && <p className="muted">No books yet.</p>}
    </>
  );
}

function UserForm({ user, onClose, onSaved }) {
  const isNew = !user;
  const [form, setForm] = useState({ email: user?.email || '', name: user?.name || '', is_admin: user?.is_admin || false, password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <Modal title={isNew ? 'Add a reader' : `Edit ${user.email}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const body = { ...form };
          if (!isNew && !body.password) delete body.password;
          try {
            await api(isNew ? '/admin/users' : `/admin/users/${user.id}`, { method: isNew ? 'POST' : 'PATCH', body });
            onSaved();
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input type="email" required value={form.email} onChange={set('email')} />
        </label>
        <label>
          Name
          <input value={form.name} onChange={set('name')} />
        </label>
        <label>
          {isNew ? 'Password' : 'New password'}{' '}
          <span className="muted">{isNew ? '(at least 8 characters)' : '(leave blank to keep their current password)'}</span>
          <input type="text" autoComplete="new-password" minLength={8} required={isNew} value={form.password} onChange={set('password')} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={form.is_admin} onChange={set('is_admin')} /> Admin (can manage books and users)
        </label>
        {!isNew && form.password && <p className="muted small">Setting a new password signs them out everywhere. Let them know the new password.</p>}
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Users() {
  const { user: me } = useApp();
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // user object, or 'new'
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/users?q=${encodeURIComponent(q)}`).then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <div className="toolbar">
        <h2>Readers ({users?.length ?? '…'})</h2>
        <div className="toolbar-controls">
          <input type="search" placeholder="Search by email or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> Add reader
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Last login</th>
              <th>Books / notes / goals</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name || <span className="muted">—</span>}</td>
                <td>{u.is_admin ? <span className="badge">Admin</span> : 'Reader'}</td>
                <td className="small">{formatDateTime(u.created_at)}</td>
                <td className="small">{formatDateTime(u.last_login_at)}</td>
                <td className="small">
                  {u.books_started} / {u.note_count} / {u.goal_count}
                </td>
                <td className="actions">
                  <button className="btn small" onClick={() => setEditing(u)}>
                    <Icon name="edit" size={16} /> Edit
                  </button>
                  {u.id !== me.id && (
                    <button
                      className="btn small ghost danger"
                      title="Delete user"
                      onClick={async () => {
                        if (!confirm(`Delete ${u.email}? Their notes, progress and goals will be deleted too. This can't be undone.`)) return;
                        await api(`/admin/users/${u.id}`, { method: 'DELETE' });
                        load();
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function GlossaryAdmin() {
  const [terms, setTerms] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ id: null, term: '', definition: '' });
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api(`/admin/glossary?q=${encodeURIComponent(q)}`).then((d) => setTerms(d.terms)).catch((e) => setError(e.message));
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api(form.id ? `/admin/glossary/${form.id}` : '/admin/glossary', {
        method: form.id ? 'PATCH' : 'POST',
        body: { term: form.term, definition: form.definition },
      });
      setForm({ id: null, term: '', definition: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <section className="card">
        <h2>{form.id ? `Edit “${form.term}”` : 'Add a word'}</h2>
        <p className="muted small">
          In glossary mode, readers tap a word to see its meaning. Words listed here show first, labelled “In older and Puritan writing.” A
          regular dictionary definition appears underneath. Add words whose older sense differs from today’s.
        </p>
        <form className="form" onSubmit={save}>
          <div className="row two">
            <label>
              Word or phrase
              <input required value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
            </label>
          </div>
          <label>
            Definition
            <textarea required rows={2} value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="btn primary">{form.id ? 'Save' : 'Add word'}</button>
            {form.id && (
              <button type="button" className="btn ghost" onClick={() => setForm({ id: null, term: '', definition: '' })}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      <div className="toolbar">
        <h2>Glossary ({terms?.length ?? '…'})</h2>
        <input type="search" placeholder="Search words" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search glossary" />
      </div>
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {terms?.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">
                  <strong>{t.term}</strong>
                </td>
                <td>{t.definition}</td>
                <td className="actions">
                  <button className="btn small" onClick={() => setForm({ id: t.id, term: t.term, definition: t.definition })}>
                    <Icon name="edit" size={16} /> Edit
                  </button>
                  <button
                    className="btn small ghost danger"
                    aria-label={`Delete ${t.term}`}
                    onClick={async () => {
                      if (!confirm(`Delete “${t.term}” from the glossary?`)) return;
                      await api(`/admin/glossary/${t.id}`, { method: 'DELETE' });
                      load();
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const TABS = { overview: 'Overview', books: 'Books', users: 'Readers', glossary: 'Glossary' };

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = TABS[params.get('tab')] ? params.get('tab') : 'books';
  return (
    <div className="page wide">
      <h1>Admin</h1>
      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setParams({ tab: k })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'books' && <Books />}
      {tab === 'users' && <Users />}
      {tab === 'glossary' && <GlossaryAdmin />}
    </div>
  );
}

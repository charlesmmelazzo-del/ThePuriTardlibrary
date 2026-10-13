import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, today } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import Cover from '../components/Cover.jsx';
import GoalSummary, { ProgressBar } from '../components/GoalSummary.jsx';
import Icon from '../components/Icon.jsx';
import { GroupCard } from './Groups.jsx';
import { useShelves } from '../lib/shelves.js';

const SORTS = {
  title: { label: 'Title', fn: (a, b) => a.title.localeCompare(b.title) },
  author: {
    label: 'Author',
    fn: (a, b) => lastName(a.author).localeCompare(lastName(b.author)) || a.title.localeCompare(b.title),
  },
  year: { label: 'Year (oldest first)', fn: (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title) },
  yearDesc: { label: 'Year (newest first)', fn: (a, b) => (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title) },
  recent: {
    label: 'Recently read',
    fn: (a, b) => (b.last_read_at || '').localeCompare(a.last_read_at || '') || a.title.localeCompare(b.title),
  },
};

function lastName(author = '') {
  const parts = author.trim().split(/\s+/);
  return (parts[parts.length - 1] || '').toLowerCase();
}

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export default function Library() {
  const { user } = useApp();
  const [books, setBooks] = useState(null);
  const [goals, setGoals] = useState([]);
  const [error, setError] = useState('');
  const [sort, setSort] = useState(() => readStorage('pl-sort', 'title'));
  const [filter, setFilter] = useState('');
  const [groupByAuthor, setGroupByAuthor] = useState(false);
  const [readingGroups, setReadingGroups] = useState([]);
  const { shelves, toggle, create, rename, remove } = useShelves();
  const [view, setView] = useState(() => readStorage('pl-shelf-view', 'all'));
  const [newShelf, setNewShelf] = useState(null);
  const chooseView = (v) => {
    setView(v);
    try {
      localStorage.setItem('pl-shelf-view', v);
    } catch {
      /* ignore */
    }
  };
  const shelf = view === 'all' ? null : shelves?.find((s) => String(s.id) === view) || null;

  useEffect(() => {
    api('/books').then((d) => setBooks(d.books)).catch((e) => setError(e.message));
    api(`/goals?today=${today()}`).then((d) => setGoals(d.goals)).catch(() => {});
    api(`/groups?today=${today()}`).then((d) => setReadingGroups(d.groups)).catch(() => {});
  }, []);

  const changeSort = (s) => {
    setSort(s);
    try {
      localStorage.setItem('pl-sort', s);
    } catch {
      /* ignore */
    }
  };

  const shown = useMemo(() => {
    if (!books) return [];
    const f = filter.trim().toLowerCase();
    return books
      .filter((b) => !shelf || shelf.book_ids.includes(b.id))
      .filter((b) => !f || `${b.title} ${b.author} ${b.year ?? ''}`.toLowerCase().includes(f))
      .sort((SORTS[sort] || SORTS.title).fn);
  }, [books, filter, sort, shelf]);

  const groups = useMemo(() => {
    if (!groupByAuthor) return [{ key: '', books: shown }];
    const map = new Map();
    for (const b of [...shown].sort(SORTS.author.fn)) {
      const k = b.author || 'Unknown author';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(b);
    }
    return [...map].map(([key, list]) => ({ key, books: list }));
  }, [shown, groupByAuthor]);

  const lastRead = books?.filter((b) => b.last_read_at).sort(SORTS.recent.fn)[0];
  const activeGoals = goals.filter((g) => !g.complete);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{user.name && user.name !== 'Admin' ? `Welcome, ${user.name.split(' ')[0]}` : 'Library'}</h1>
      </div>

      {(lastRead || activeGoals.length > 0) && (
        <section className="today-row">
          {lastRead && (
            <div className="card continue-card">
              <Cover book={lastRead} size="sm" />
              <div>
                <div className="eyebrow">Continue reading</div>
                <h3>{lastRead.title}</h3>
                <div className="muted">{lastRead.author}</div>
                <ProgressBar percent={lastRead.percent} label="Progress" />
                <div className="muted small">{lastRead.percent}% read</div>
                <Link className="btn primary small" to={`/read/${lastRead.id}/${lastRead.resume_section_id}`}>
                  Pick up where you left off
                </Link>
              </div>
            </div>
          )}
          {activeGoals.map((g) => (
            <div className="card" key={g.id}>
              <div className="eyebrow">Today's reading goal</div>
              <GoalSummary goal={g} showBook compact continueTo={`/books/${g.book_id}?resume=1`} />
            </div>
          ))}
        </section>
      )}

      {readingGroups.length > 0 && (
        <section>
          <div className="toolbar">
            <h2>Your reading groups</h2>
            <Link to="/groups" className="small">
              All groups
            </Link>
          </div>
          <div className="group-list compact">
            {readingGroups.slice(0, 4).map((g) => (
              <GroupCard key={g.id} g={g} />
            ))}
          </div>
        </section>
      )}

      <div className="shelf-tabs" role="tablist" aria-label="Shelves">
        <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''} onClick={() => chooseView('all')}>
          <Icon name="library" size={16} /> All books
        </button>
        {shelves?.map((s) => (
          <button key={s.id} role="tab" aria-selected={view === String(s.id)} className={view === String(s.id) ? 'active' : ''} onClick={() => chooseView(String(s.id))}>
            <Icon name={s.is_default ? 'bookmark' : 'shelf'} size={16} /> {s.name}
            <span className="count">{s.book_ids.length}</span>
          </button>
        ))}
        {newShelf === null ? (
          <button className="new-shelf" onClick={() => setNewShelf('')}>
            <Icon name="plus" size={16} /> New shelf
          </button>
        ) : (
          <form
            className="new-shelf-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newShelf.trim()) return;
              const s = await create(newShelf.trim());
              setNewShelf(null);
              chooseView(String(s.id));
            }}
          >
            <input autoFocus placeholder="Shelf name" value={newShelf} onChange={(e) => setNewShelf(e.target.value)} onBlur={() => !newShelf && setNewShelf(null)} />
            <button className="btn small primary">Create</button>
          </form>
        )}
      </div>

      <div className="toolbar">
        <h2>
          {shelf ? shelf.name : 'All books'}
          {shelf && !shelf.is_default && (
            <span className="shelf-actions">
              <button
                className="link-btn small"
                onClick={async () => {
                  const name = prompt('Rename shelf', shelf.name);
                  if (name && name.trim()) await rename(shelf, name.trim());
                }}
              >
                Rename
              </button>
              <button
                className="link-btn small danger"
                onClick={async () => {
                  if (!confirm(`Delete the shelf “${shelf.name}”? The books stay in the library.`)) return;
                  await remove(shelf);
                  chooseView('all');
                }}
              >
                Delete
              </button>
            </span>
          )}
        </h2>
        <div className="toolbar-controls">
          <input
            type="search"
            placeholder="Filter by title, author, year"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter books"
          />
          <label className="inline">
            Sort
            <select value={sort} onChange={(e) => changeSort(e.target.value)}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline checkbox">
            <input type="checkbox" checked={groupByAuthor} onChange={(e) => setGroupByAuthor(e.target.checked)} />
            Group by author
          </label>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {!books && !error && <div className="muted">Loading the library…</div>}
      {books && books.length === 0 && (
        <div className="empty">
          <p>The library is empty for now. New books are on their way.</p>
          {user.is_admin && (
            <Link className="btn primary" to="/admin/books/new">
              Add the first book
            </Link>
          )}
        </div>
      )}
      {books && books.length > 0 && shown.length === 0 && (
        <div className="empty">
          {filter ? (
            <p>No books match “{filter}”.</p>
          ) : (
            <p>
              Nothing on this shelf yet. Tap the <Icon name="bookmark" size={14} /> on a book in <button className="link-btn" onClick={() => chooseView('all')}>All books</button>, or use
              “Add to shelf” on a book’s page.
            </p>
          )}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key || 'all'}>
          {g.key && <h3 className="group-head">{g.key}</h3>}
          <div className="book-grid">
            {g.books.map((b) => (
              <Link key={b.id} to={`/books/${b.id}`} className="book-tile">
                <div className="tile-cover">
                  <Cover book={b} />
                  {shelves?.[0] && (
                    <button
                      className={`shelf-toggle ${shelves[0].book_ids.includes(b.id) ? 'on' : ''}`}
                      aria-pressed={shelves[0].book_ids.includes(b.id)}
                      aria-label={shelves[0].book_ids.includes(b.id) ? `Remove from ${shelves[0].name}` : `Add to ${shelves[0].name}`}
                      title={shelves[0].book_ids.includes(b.id) ? `On ${shelves[0].name}` : `Add to ${shelves[0].name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle(shelves[0], b.id);
                      }}
                    >
                      <Icon name="bookmark" size={18} />
                    </button>
                  )}
                </div>
                <div className="book-tile-info">
                  <div className="book-tile-title">{b.title}</div>
                  <div className="muted small">
                    {b.author}
                    {b.year ? ` · ${b.year}` : ''}
                  </div>
                  {b.max_seq > 0 && <ProgressBar percent={b.percent} label={`${b.percent}% read`} />}
                  {!b.published && <span className="badge">Hidden</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

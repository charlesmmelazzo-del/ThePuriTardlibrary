import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, today } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import Cover from '../components/Cover.jsx';
import GoalSummary, { ProgressBar } from '../components/GoalSummary.jsx';

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

  useEffect(() => {
    api('/books').then((d) => setBooks(d.books)).catch((e) => setError(e.message));
    api(`/goals?today=${today()}`).then((d) => setGoals(d.goals)).catch(() => {});
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
      .filter((b) => !f || `${b.title} ${b.author} ${b.year ?? ''}`.toLowerCase().includes(f))
      .sort((SORTS[sort] || SORTS.title).fn);
  }, [books, filter, sort]);

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
        <h1>{user.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Library'}</h1>
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

      <div className="toolbar">
        <h2>The Library</h2>
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
      {books && books.length > 0 && shown.length === 0 && <div className="muted">No books match “{filter}”.</div>}

      {groups.map((g) => (
        <section key={g.key || 'all'}>
          {g.key && <h3 className="group-head">{g.key}</h3>}
          <div className="book-grid">
            {g.books.map((b) => (
              <Link key={b.id} to={`/books/${b.id}`} className="book-tile">
                <Cover book={b} />
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

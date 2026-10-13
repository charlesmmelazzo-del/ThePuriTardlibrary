import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, today } from '../lib/api.js';
import Cover from '../components/Cover.jsx';
import GoalForm from '../components/GoalForm.jsx';
import GoalSummary from '../components/GoalSummary.jsx';
import Icon from '../components/Icon.jsx';

export default function Goals() {
  const [goals, setGoals] = useState(null);
  const [books, setBooks] = useState([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [bookId, setBookId] = useState('');
  const [changing, setChanging] = useState(null);

  const load = useCallback(() => {
    api(`/goals?today=${today()}`).then((d) => setGoals(d.goals)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    api('/books').then((d) => setBooks(d.books)).catch(() => {});
  }, [load]);

  const withoutGoal = books.filter((b) => !goals?.some((g) => g.book_id === b.id) && b.total_paragraphs > 0);
  const chosen = books.find((b) => String(b.id) === bookId);

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Reading goals</h1>
        {!adding && withoutGoal.length > 0 && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> New goal
          </button>
        )}
      </div>
      <p className="muted">
        Choose a book and when you'd like to finish it. Each day we'll tell you how much to read. Miss a few days and we'll work out
        what it takes to catch up.
      </p>
      {error && <div className="error">{error}</div>}

      {adding && (
        <section className="card">
          <h2>New goal</h2>
          <label>
            Book
            <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">Choose a book…</option>
              {withoutGoal.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} — {b.author}
                </option>
              ))}
            </select>
          </label>
          {chosen ? (
            <GoalForm
              bookId={chosen.id}
              remaining={chosen.total_paragraphs - chosen.max_seq}
              onCancel={() => setAdding(false)}
              onSaved={() => {
                setAdding(false);
                setBookId('');
                load();
              }}
            />
          ) : (
            <button className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
          )}
        </section>
      )}

      {goals && goals.length === 0 && !adding && (
        <div className="empty">
          <p>No goals yet. Set one to build a daily reading habit.</p>
        </div>
      )}

      <div className="goal-list">
        {goals?.map((g) => (
          <section key={g.id} className="card goal-card">
            <Link to={`/books/${g.book_id}`}>
              <Cover book={{ title: g.book_title, author: g.book_author, cover_url: g.cover_url }} size="sm" />
            </Link>
            <div className="goal-card-body">
              <h2>
                <Link to={`/books/${g.book_id}`}>{g.book_title}</Link>
              </h2>
              <div className="muted small">{g.book_author}</div>
              {changing === g.id ? (
                <GoalForm
                  bookId={g.book_id}
                  remaining={g.remaining_paragraphs}
                  onCancel={() => setChanging(null)}
                  onSaved={() => {
                    setChanging(null);
                    load();
                  }}
                />
              ) : (
                <>
                  <GoalSummary goal={g} continueTo={`/books/${g.book_id}?resume=1`} />
                  <div className="row">
                    <button className="btn small ghost" onClick={() => setChanging(g.id)}>
                      Change date
                    </button>
                    <button
                      className="btn small ghost"
                      onClick={async () => {
                        if (!confirm(`Remove your goal for ${g.book_title}?`)) return;
                        await api(`/goals/${g.id}`, { method: 'DELETE' });
                        load();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, today } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import Cover from '../components/Cover.jsx';
import GoalForm from '../components/GoalForm.jsx';
import GoalSummary, { ProgressBar } from '../components/GoalSummary.jsx';
import Icon from '../components/Icon.jsx';
import ShelfPicker from '../components/ShelfPicker.jsx';
import { useShelves } from '../lib/shelves.js';

export function Toc({ toc, bookId, maxSeq = 0, currentSectionId, onNavigate }) {
  return (
    <ol className="toc">
      {toc.map((ch) => (
        <li key={ch.id}>
          <div className="toc-chapter">{ch.title}</div>
          <ol>
            {ch.sections.map((s, i) => {
              const done = s.paragraphs > 0 && s.last_seq <= maxSeq;
              return (
                <li key={s.id} className={s.id === currentSectionId ? 'current' : ''}>
                  <Link to={`/read/${bookId}/${s.id}`} onClick={onNavigate}>
                    <span className={`toc-dot ${done ? 'done' : ''}`}>{done ? <Icon name="check" size={12} /> : null}</span>
                    <span>{s.title || (ch.sections.length > 1 ? `Part ${i + 1}` : 'Read chapter')}</span>
                    <span className="muted small">{s.paragraphs}¶</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}

export default function BookPage() {
  const { bookId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [picking, setPicking] = useState(false);
  const [bookGroups, setBookGroups] = useState([]);
  const { shelves, toggle, create } = useShelves();
  useEffect(() => {
    api(`/groups?book_id=${bookId}&today=${today()}`)
      .then((d) => setBookGroups(d.groups))
      .catch(() => {});
  }, [bookId]);

  const load = useCallback(
    () =>
      api(`/books/${bookId}?today=${today()}`)
        .then((d) => {
          if (params.get('resume') && d.resume_section_id) {
            navigate(`/read/${bookId}/${d.resume_section_id}`, { replace: true });
            return;
          }
          setData(d);
        })
        .catch((e) => setError(e.message)),
    [bookId, params, navigate],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="page"><div className="error">{error}</div></div>;
  if (!data) return <div className="page muted">Loading…</div>;
  const { book, toc, progress, goal, resume_section_id: resumeId, percent } = data;
  const remaining = book.total_paragraphs - (progress?.max_seq || 0);

  return (
    <div className="page book-page">
      <div className="book-hero">
        <Cover book={book} size="lg" />
        <div className="book-hero-info">
          <h1>{book.title}</h1>
          <div className="book-byline">
            {book.author}
            {book.year ? ` · ${book.year}` : ''}
          </div>
          {book.description && <p className="book-desc">{book.description}</p>}
          {progress && (
            <div className="book-progress">
              <ProgressBar percent={percent} label="Progress" />
              <span className="muted small">{percent}% read</span>
            </div>
          )}
          <div className="row">
            {resumeId && (
              <Link className="btn primary" to={`/read/${book.id}/${resumeId}`}>
                <Icon name="book" size={18} /> {progress ? 'Continue reading' : 'Start reading'}
              </Link>
            )}
            {!goal && !editingGoal && book.total_paragraphs > 0 && (
              <button className="btn" onClick={() => setEditingGoal(true)}>
                <Icon name="target" size={18} /> Set a reading goal
              </button>
            )}
            <button className="btn" onClick={() => setPicking(true)}>
              <Icon name="bookmark" size={18} />
              {shelves?.some((s) => s.book_ids.includes(book.id)) ? 'On your shelf' : 'Add to shelf'}
            </button>
            {book.total_paragraphs > 0 && (
              <Link className="btn" to={`/groups?new&book=${book.id}`}>
                <Icon name="users" size={18} /> Start a reading group
              </Link>
            )}
            {user.is_admin && (
              <Link className="btn ghost" to={`/admin/books/${book.id}`}>
                <Icon name="edit" size={18} /> Edit
              </Link>
            )}
          </div>
        </div>
      </div>

      {bookGroups.length > 0 && (
        <section className="card">
          <h2>Your groups reading this book</h2>
          <ul className="plain-list">
            {bookGroups.map((g) => (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`}>
                  <Icon name="users" size={16} /> {g.name}
                </Link>{' '}
                <span className="muted small">
                  · {g.member_count} reader{g.member_count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {picking && <ShelfPicker book={book} shelves={shelves} toggle={toggle} create={create} onClose={() => setPicking(false)} />}

      {(goal || editingGoal) && (
        <section className="card">
          <div className="card-head">
            <h2>Reading goal</h2>
            {goal && !editingGoal && (
              <div className="row">
                <button className="btn small" onClick={() => setEditingGoal(true)}>
                  Change date
                </button>
                <button
                  className="btn small ghost"
                  onClick={async () => {
                    if (!confirm('Remove this reading goal?')) return;
                    await api(`/goals/${goal.id}`, { method: 'DELETE' });
                    load();
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
          {editingGoal ? (
            <GoalForm
              bookId={book.id}
              remaining={remaining}
              onCancel={() => setEditingGoal(false)}
              onSaved={() => {
                setEditingGoal(false);
                load();
              }}
            />
          ) : (
            <GoalSummary goal={goal} continueTo={resumeId ? `/read/${book.id}/${resumeId}` : null} />
          )}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Contents</h2>
          {progress && (
            <button
              className="btn small ghost"
              onClick={async () => {
                if (!confirm('Start this book over? Your notes are kept; your place and progress are reset.')) return;
                await api(`/books/${book.id}/progress`, { method: 'DELETE' });
                load();
              }}
            >
              Start over
            </button>
          )}
        </div>
        {toc.length === 0 ? (
          <p className="muted">This book doesn't have any text yet.</p>
        ) : (
          <Toc toc={toc} bookId={book.id} maxSeq={progress?.max_seq || 0} currentSectionId={progress?.section_id} />
        )}
      </section>
    </div>
  );
}

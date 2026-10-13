import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, formatDateTime, today } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import FlipCard from '../components/FlipCard.jsx';
import Icon from '../components/Icon.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import { goalMessage } from '../components/GoalSummary.jsx';
import { Toc } from './Book.jsx';

const HINT_KEY = 'pl-flip-hint-dismissed';

function useStoredFlag(key) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const set = () => {
    setValue(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
  };
  return [value, set];
}

export default function Reader() {
  const { bookId, sectionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, updateMe } = useApp();

  const [book, setBook] = useState(null); // book info + toc + progress + goal
  const [section, setSection] = useState(null);
  const [error, setError] = useState('');
  const [side, setSide] = useState(user.default_side || 'modern');
  const [fontSize, setFontSize] = useState(user.font_size || 18);
  const [tocOpen, setTocOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(null); // paragraph id whose notes panel is open
  const [editing, setEditing] = useState(null); // note id being edited, or 'new'
  const [sharing, setSharing] = useState(null);
  const [goal, setGoal] = useState(null);
  const [hintDismissed, dismissHint] = useStoredFlag(HINT_KEY);
  const [highlightId, setHighlightId] = useState(null);

  const lastSaved = useRef({ at: null, throughSeq: 0 });
  const pending = useRef(null);
  const saveTimer = useRef(null);
  const firstLoad = useRef(true);

  /* ---------- loading ---------- */

  useEffect(() => {
    api(`/books/${bookId}?today=${today()}`)
      .then((d) => {
        setBook(d);
        setGoal(d.goal);
        lastSaved.current.throughSeq = d.progress?.max_seq || 0;
      })
      .catch((e) => setError(e.message));
  }, [bookId]);

  useEffect(() => {
    setSection(null);
    setNotesOpen(null);
    setEditing(null);
    api(`/books/${bookId}/sections/${sectionId}`)
      .then(setSection)
      .catch((e) => setError(e.message));
  }, [bookId, sectionId]);

  /* ---------- saving progress ---------- */

  const flush = useCallback(
    (keepalive = false) => {
      clearTimeout(saveTimer.current);
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      api(`/books/${bookId}/progress`, {
        method: 'PUT',
        keepalive,
        body: { paragraph_id: p.at, read_through_id: p.through, today: today() },
      })
        .then((d) => d.goal && setGoal(d.goal))
        .catch(() => {});
    },
    [bookId],
  );

  const queueSave = useCallback(
    (at, through) => {
      const throughSeq = through?.seq || 0;
      if (at === lastSaved.current.at && throughSeq <= lastSaved.current.throughSeq) return;
      lastSaved.current = { at, throughSeq: Math.max(throughSeq, lastSaved.current.throughSeq) };
      pending.current = { at, through: through?.id ?? null };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => flush(false), 1200);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush(true);
    };
  }, [flush]);

  // Work out which paragraph is at the top of the screen (resume point) and which paragraphs have been read.
  const measure = useCallback(() => {
    if (!section?.paragraphs.length) return;
    const topLimit = 110;
    const readLine = window.innerHeight * 0.45;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40;
    let at = null;
    let through = null;
    for (const p of section.paragraphs) {
      const el = document.getElementById(`p-${p.id}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (!at && r.bottom > topLimit) at = p;
      if (r.bottom <= readLine || (atBottom && r.bottom <= window.innerHeight)) through = p;
    }
    if (at) queueSave(at.id, through);
  }, [section, queueSave]);

  useEffect(() => {
    let t;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(measure, 250);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(t);
    };
  }, [measure]);

  // Scroll to the linked paragraph or the saved place when a section opens.
  useLayoutEffect(() => {
    if (!section || !book) return;
    const fromHash = /^#p-(\d+)$/.exec(location.hash)?.[1];
    let target = fromHash ? Number(fromHash) : null;
    if (!target && firstLoad.current && book.progress?.section_id === section.section.id) {
      target = book.progress.paragraph_id;
    }
    firstLoad.current = false;
    const el = target && document.getElementById(`p-${target}`);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      if (fromHash) {
        setHighlightId(target);
        setTimeout(() => setHighlightId(null), 2500);
      }
    } else {
      window.scrollTo(0, 0);
    }
    const first = section.paragraphs[0];
    if (first) queueSave(target || first.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, book]);

  /* ---------- actions ---------- */

  const goToSection = (id, markRead) => {
    if (markRead && section.paragraphs.length) {
      const last = section.paragraphs[section.paragraphs.length - 1];
      lastSaved.current.at = null;
      queueSave(last.id, last);
      flush(false);
    }
    setTocOpen(false);
    navigate(`/read/${bookId}/${id}`);
  };

  const changeFont = (delta) => {
    const next = Math.max(14, Math.min(28, fontSize + delta));
    setFontSize(next);
    updateMe({ font_size: next }).catch(() => {});
  };

  const addNote = async (paragraphId, body) => {
    const { note } = await api('/notes', { method: 'POST', body: { paragraph_id: paragraphId, body } });
    setSection((s) => ({ ...s, notes: [...s.notes, note] }));
    setEditing(null);
  };
  const saveNote = async (id, body) => {
    const { note } = await api(`/notes/${id}`, { method: 'PATCH', body: { body } });
    setSection((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? note : n)) }));
    setEditing(null);
  };
  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    await api(`/notes/${id}`, { method: 'DELETE' });
    setSection((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
  };

  if (error) {
    return (
      <div className="page">
        <div className="error">{error}</div>
        <Link to="/">Back to the library</Link>
      </div>
    );
  }
  if (!section || !book) return <div className="page muted">Opening the book…</div>;

  const { section: sec, paragraphs, notes } = section;
  const goalMsg = goal ? goalMessage(goal) : null;
  const source = {
    title: section.book.title,
    author: section.book.author,
    year: section.book.year,
    chapter: sec.chapter_title,
    section: sec.title,
  };

  return (
    <div className="reader" style={{ '--reader-size': `${fontSize}px` }}>
      <div className="reader-bar">
        <div className="reader-bar-inner">
          <Link to={`/books/${bookId}`} className="icon-btn" aria-label="Back to book">
            <Icon name="left" />
          </Link>
          <button className="reader-title" onClick={() => setTocOpen(true)} aria-label="Open contents">
            <span className="reader-book">{section.book.title}</span>
            <span className="reader-where">
              {sec.chapter_title}
              {sec.title ? ` › ${sec.title}` : ''}
            </span>
          </button>
          <div className="segmented small" role="radiogroup" aria-label="Show text in">
            <button role="radio" aria-checked={side === 'modern'} className={side === 'modern' ? 'active' : ''} onClick={() => setSide('modern')}>
              Modern
            </button>
            <button role="radio" aria-checked={side === 'original'} className={side === 'original' ? 'active' : ''} onClick={() => setSide('original')}>
              Original
            </button>
          </div>
          <div className="font-controls">
            <button className="icon-btn text" onClick={() => changeFont(-1)} aria-label="Smaller text">
              A−
            </button>
            <button className="icon-btn text" onClick={() => changeFont(1)} aria-label="Larger text">
              A+
            </button>
          </div>
          <button className="icon-btn" onClick={() => setTocOpen(true)} aria-label="Contents">
            <Icon name="list" />
          </button>
        </div>
        {goalMsg && !goal.complete && (
          <Link to={`/books/${bookId}`} className={`goal-pill tone-${goalMsg.tone}`}>
            <Icon name={goal.today_done ? 'check' : 'target'} size={14} />
            {goal.today_done
              ? "Today's reading done"
              : goal.overdue
                ? `${goal.remaining_paragraphs} paragraphs left`
                : `${goal.today_left} paragraph${goal.today_left === 1 ? '' : 's'} left today${goal.behind ? ' (catching up)' : ''}`}
          </Link>
        )}
      </div>

      <div className="reader-body">
        <header className="section-head">
          <div className="eyebrow">{sec.chapter_title}</div>
          {sec.title && <h1>{sec.title}</h1>}
          <div className="muted small">
            Section {section.section_index + 1} of {section.section_count}
          </div>
        </header>

        {!hintDismissed && (
          <div className="hint">
            <Icon name="flip" />
            <span>
              Swipe a paragraph sideways, or tap <strong>Original</strong> / <strong>Modern</strong> beneath it, to flip between the original
              and modern English. Use the switch at the top to flip them all.
            </span>
            <button className="icon-btn" onClick={dismissHint} aria-label="Dismiss tip">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}

        {paragraphs.length === 0 && <p className="muted">This section has no text yet.</p>}

        {paragraphs.map((p) => {
          const pNotes = notes.filter((n) => n.paragraph_id === p.id);
          const open = notesOpen === p.id;
          return (
            <div key={p.id} className="para-wrap">
              <FlipCard
                paragraph={p}
                side={side}
                year={section.book.year}
                noteCount={pNotes.length}
                highlighted={highlightId === p.id}
                onAddNote={() => {
                  setNotesOpen(open ? null : p.id);
                  setEditing(open || pNotes.length ? null : 'new');
                }}
                onShare={(shown) => setSharing({ paragraph: p, version: shown })}
              />
              {!open && pNotes.length > 0 && (
                <button className="note-peek" onClick={() => setNotesOpen(p.id)}>
                  <Icon name="note" size={14} /> {pNotes[0].body.slice(0, 90)}
                  {pNotes[0].body.length > 90 || pNotes.length > 1 ? '…' : ''}
                </button>
              )}
              {open && (
                <div className="notes-panel">
                  {pNotes.map((n) =>
                    editing === n.id ? (
                      <NoteEditor key={n.id} initial={n.body} onSave={(b) => saveNote(n.id, b)} onCancel={() => setEditing(null)} />
                    ) : (
                      <div key={n.id} className="note">
                        <p>{n.body}</p>
                        <div className="note-meta">
                          <span className="muted small">{formatDateTime(n.updated_at)}</span>
                          <button className="link-btn" onClick={() => setEditing(n.id)}>
                            Edit
                          </button>
                          <button className="link-btn danger" onClick={() => deleteNote(n.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                  {editing === 'new' ? (
                    <NoteEditor onSave={(b) => addNote(p.id, b)} onCancel={() => (pNotes.length ? setEditing(null) : setNotesOpen(null))} />
                  ) : (
                    <div className="row">
                      <button className="btn small" onClick={() => setEditing('new')}>
                        <Icon name="plus" size={16} /> Add note
                      </button>
                      <button className="btn small ghost" onClick={() => setNotesOpen(null)}>
                        Close
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <nav className="section-nav" aria-label="Sections">
          {section.prev_section_id ? (
            <button className="btn" onClick={() => goToSection(section.prev_section_id, false)}>
              <Icon name="left" size={18} /> Previous
            </button>
          ) : (
            <span />
          )}
          {section.next_section_id ? (
            <button className="btn primary" onClick={() => goToSection(section.next_section_id, true)}>
              Next section <Icon name="right" size={18} />
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={() => {
                const last = paragraphs[paragraphs.length - 1];
                if (last) {
                  lastSaved.current.at = null;
                  queueSave(last.id, last);
                  flush(false);
                }
                navigate(`/books/${bookId}`);
              }}
            >
              <Icon name="check" size={18} /> Finish book
            </button>
          )}
        </nav>
      </div>

      {tocOpen && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setTocOpen(false)}>
          <aside className="drawer" aria-label="Contents">
            <div className="modal-head">
              <h2>Contents</h2>
              <button className="icon-btn" onClick={() => setTocOpen(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <Toc
              toc={book.toc}
              bookId={bookId}
              maxSeq={Math.max(goal?.done_paragraphs || 0, lastSaved.current.throughSeq)}
              currentSectionId={sec.id}
              onNavigate={() => setTocOpen(false)}
            />
          </aside>
        </div>
      )}

      {sharing && (
        <ShareSheet paragraph={sharing.paragraph} initialVersion={sharing.version} source={source} onClose={() => setSharing(null)} />
      )}
    </div>
  );
}

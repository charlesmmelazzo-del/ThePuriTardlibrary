import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, formatDateTime, today } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import FlipCard from '../components/FlipCard.jsx';
import Icon from '../components/Icon.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import ShareSheet from '../components/ShareSheet.jsx';
import { goalMessage } from '../components/GoalSummary.jsx';
import DefinitionPopover from '../components/DefinitionPopover.jsx';
import { BookmarkList, Toc } from './Book.jsx';

const HINT_KEY = 'pl-flip-hint-dismissed';
const GLOSSARY_KEY = 'pl-glossary-mode';

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
  const [glossary, setGlossary] = useState(() => {
    try {
      return localStorage.getItem(GLOSSARY_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [define, setDefine] = useState(null); // { word, rect }
  const [groupStatus, setGroupStatus] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [drawerTab, setDrawerTab] = useState('contents');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const closeDefine = useCallback(() => {
    setDefine(null);
    window.getSelection()?.removeAllRanges();
  }, []);
  const toggleGlossary = () => {
    const next = !glossary;
    setGlossary(next);
    if (!next) closeDefine();
    try {
      localStorage.setItem(GLOSSARY_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

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
        setBookmarks(d.bookmarks || []);
        lastSaved.current.throughSeq = d.progress?.max_seq || 0;
      })
      .catch((e) => setError(e.message));
    api(`/groups?book_id=${bookId}&today=${today()}`)
      .then((d) => setGroupStatus(d.groups))
      .catch(() => {});
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
    // A bookmark dropped by hand ("take me back here") wins over the automatically saved place.
    const mark = book.resume_bookmark;
    const toMark = firstLoad.current && mark?.section_id === section.section.id && (!target || target === mark.paragraph_id);
    if (toMark) {
      target = mark.paragraph_id;
      markResumed(mark.id);
      showToast('Back to your bookmark');
    } else if (!target && firstLoad.current && book.progress?.section_id === section.section.id) {
      target = book.progress.paragraph_id;
    }
    firstLoad.current = false;
    const el = target && document.getElementById(`p-${target}`);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      if (fromHash || toMark) {
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

  function markResumed(id) {
    setBookmarks((list) => list.map((b) => (b.id === id ? { ...b, resume: false } : b)));
    api(`/books/${bookId}/bookmarks/${id}/resumed`, { method: 'POST' }).catch(() => {});
  }

  const toggleBookmark = async (p) => {
    const existing = bookmarks.find((b) => b.paragraph_id === p.id);
    try {
      if (existing) {
        await api(`/books/${bookId}/bookmarks/${existing.id}`, { method: 'DELETE' });
        setBookmarks((list) => list.filter((b) => b.id !== existing.id));
        showToast('Bookmark removed');
      } else {
        const { bookmark } = await api(`/books/${bookId}/bookmarks`, { method: 'POST', body: { paragraph_id: p.id } });
        setBookmarks((list) =>
          [...list.map((b) => ({ ...b, resume: false })), bookmark].sort((a, b) => a.seq - b.seq),
        );
        showToast('Bookmarked: the book opens here next time');
      }
    } catch (e) {
      showToast(e.message);
    }
  };

  const goToBookmark = (b) => {
    setTocOpen(false);
    if (b.resume) markResumed(b.id);
    if (b.section_id === section.section.id) {
      document.getElementById(`p-${b.paragraph_id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setHighlightId(b.paragraph_id);
      setTimeout(() => setHighlightId(null), 2500);
    } else {
      navigate(`/read/${bookId}/${b.section_id}#p-${b.paragraph_id}`);
    }
  };

  const changeFont = (delta) => {
    const next = Math.max(14, Math.min(28, fontSize + delta));
    setFontSize(next);
    updateMe({ font_size: next }).catch(() => {});
  };

  const addNote = async (paragraphId, body, groupId) => {
    const { note } = await api('/notes', { method: 'POST', body: { paragraph_id: paragraphId, body, group_id: groupId } });
    setSection((s) => ({ ...s, notes: [...s.notes, note] }));
    setEditing(null);
  };
  const saveNote = async (id, body) => {
    const { note } = await api(`/notes/${id}`, { method: 'PATCH', body: { body } });
    setSection((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, body: note.body, updated_at: note.updated_at } : n)) }));
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
          <button
            className="reader-title"
            onClick={() => {
              setDrawerTab('contents');
              setTocOpen(true);
            }}
            aria-label="Open contents"
          >
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
          <button
            className={`icon-btn ${glossary ? 'active' : ''}`}
            onClick={toggleGlossary}
            aria-pressed={glossary}
            aria-label="Glossary mode: tap a word to see its meaning"
            title="Glossary mode: tap a word to see its meaning"
          >
            <Icon name="glossary" />
          </button>
          <button
            className="icon-btn bar-bookmarks"
            onClick={() => {
              setDrawerTab('bookmarks');
              setTocOpen(true);
            }}
            aria-label="Bookmarks"
            title="Bookmarks"
          >
            <Icon name="bookmark" />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setDrawerTab('contents');
              setTocOpen(true);
            }}
            aria-label="Contents"
          >
            <Icon name="list" />
          </button>
        </div>
        {((goalMsg && !goal.complete) || groupStatus.length > 0) && (
          <div className="pill-row">
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
            {groupStatus.slice(0, 1).map((g) => {
              const p = g.my_pace;
              const label = p.finished
                ? 'finished'
                : p.status === 'on_track'
                  ? 'caught up'
                  : p.status === 'no_assignment'
                    ? 'no reading assigned'
                    : `${p.today_left} left today${p.status === 'behind' ? ' (catching up)' : ''}`;
              return (
                <Link key={g.id} to={`/groups/${g.id}`} className={`goal-pill ${p.status === 'behind' ? 'tone-behind' : p.status === 'on_track' || p.finished ? 'tone-done' : ''}`}>
                  <Icon name="users" size={14} /> {g.name}: {label}
                </Link>
              );
            })}
            {groupStatus.length > 1 && (
              <Link to="/groups" className="goal-pill">
                +{groupStatus.length - 1} more group{groupStatus.length > 2 ? 's' : ''}
              </Link>
            )}
          </div>
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

        {glossary && (
          <div className="hint glossary-hint">
            <Icon name="glossary" />
            <span>
              <strong>Glossary mode is on.</strong> Tap any word (or select a phrase) to see what it means.
            </span>
            <button className="icon-btn" onClick={toggleGlossary} aria-label="Turn off glossary mode">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}

        {paragraphs.length === 0 && <p className="muted">This section has no text yet.</p>}

        {paragraphs.map((p) => {
          const pNotes = notes.filter((n) => n.paragraph_id === p.id);
          const open = notesOpen === p.id;
          return (
            <div key={p.id} className={`para-wrap ${bookmarks.some((b) => b.paragraph_id === p.id) ? 'bookmarked' : ''}`}>
              <FlipCard
                paragraph={p}
                bookmarked={bookmarks.some((b) => b.paragraph_id === p.id)}
                onBookmark={() => toggleBookmark(p)}
                side={side}
                year={section.book.year}
                noteCount={pNotes.length}
                highlighted={highlightId === p.id}
                glossary={glossary}
                onDefine={(word, rect) => setDefine({ word, rect })}
                onAddNote={() => {
                  setNotesOpen(open ? null : p.id);
                  setEditing(open || pNotes.length ? null : 'new');
                }}
                onShare={(shown) => setSharing({ paragraph: p, version: shown })}
              />
              {!open && pNotes.length > 0 && (
                <button className="note-peek" onClick={() => setNotesOpen(p.id)}>
                  <Icon name={pNotes.some((n) => n.group_id) ? 'users' : 'note'} size={14} /> {pNotes[0].body.slice(0, 90)}
                  {pNotes[0].body.length > 90 || pNotes.length > 1 ? '…' : ''}
                </button>
              )}
              {open && (
                <div className="notes-panel">
                  {pNotes.map((n) =>
                    editing === n.id ? (
                      <NoteEditor key={n.id} initial={n.body} onSave={(b) => saveNote(n.id, b)} onCancel={() => setEditing(null)} />
                    ) : (
                      <div key={n.id} className={`note ${n.group_id ? 'group-note' : ''}`}>
                        {n.group_id && (
                          <div className="note-author">
                            <Icon name="users" size={13} /> {n.is_mine ? 'You' : n.author} · <span className="muted">{n.group_name}</span>
                          </div>
                        )}
                        <p>{n.body}</p>
                        <div className="note-meta">
                          <span className="muted small">
                            {n.group_id ? '' : 'Private · '}
                            {formatDateTime(n.updated_at)}
                          </span>
                          {n.is_mine && (
                            <button className="link-btn" onClick={() => setEditing(n.id)}>
                              Edit
                            </button>
                          )}
                          {(n.is_mine || n.can_moderate) && (
                            <button className="link-btn danger" onClick={() => deleteNote(n.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                  {editing === 'new' ? (
                    <NoteEditor
                      groups={section.groups || []}
                      onSave={(b, gid) => addNote(p.id, b, gid)}
                      onCancel={() => (pNotes.length ? setEditing(null) : setNotesOpen(null))}
                    />
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
          <aside className="drawer" aria-label={drawerTab === 'bookmarks' ? 'Bookmarks' : 'Contents'}>
            <div className="modal-head">
              <div className="segmented" role="tablist">
                <button role="tab" aria-selected={drawerTab === 'contents'} className={drawerTab === 'contents' ? 'active' : ''} onClick={() => setDrawerTab('contents')}>
                  <Icon name="list" size={16} /> Contents
                </button>
                <button role="tab" aria-selected={drawerTab === 'bookmarks'} className={drawerTab === 'bookmarks' ? 'active' : ''} onClick={() => setDrawerTab('bookmarks')}>
                  <Icon name="bookmark" size={16} /> Bookmarks{bookmarks.length ? ` (${bookmarks.length})` : ''}
                </button>
              </div>
              <button className="icon-btn" onClick={() => setTocOpen(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            {drawerTab === 'bookmarks' ? (
              <BookmarkList bookmarks={bookmarks} onOpen={goToBookmark} onRemove={(b) => toggleBookmark({ id: b.paragraph_id })} />
            ) : (
              <Toc
                toc={book.toc}
                bookId={bookId}
                maxSeq={Math.max(goal?.done_paragraphs || 0, lastSaved.current.throughSeq)}
                currentSectionId={sec.id}
                onNavigate={() => setTocOpen(false)}
              />
            )}
          </aside>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Icon name="bookmark" size={16} className="filled" /> {toast}
        </div>
      )}

      {define && <DefinitionPopover word={define.word} rect={define.rect} onClose={closeDefine} />}

      {sharing && (
        <ShareSheet paragraph={sharing.paragraph} initialVersion={sharing.version} source={source} onClose={() => setSharing(null)} />
      )}
    </div>
  );
}

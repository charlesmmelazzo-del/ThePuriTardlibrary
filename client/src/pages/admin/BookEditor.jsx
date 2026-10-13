import { memo, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Cover from '../../components/Cover.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';

let keySeq = 0;
const key = () => `k${++keySeq}`;

const withKeys = (chapters = []) =>
  chapters.map((c) => ({
    _k: key(),
    title: c.title || '',
    sections: (c.sections || (c.paragraphs ? [{ title: '', paragraphs: c.paragraphs }] : [])).map((s) => ({
      _k: key(),
      title: s.title || '',
      paragraphs: (s.paragraphs || []).map((p) => ({
        _k: key(),
        original: typeof p === 'string' ? p : p.original || '',
        modern: typeof p === 'string' ? '' : p.modern || '',
      })),
    })),
  }));

const stripKeys = (chapters) =>
  chapters.map((c) => ({
    title: c.title,
    sections: c.sections.map((s) => ({
      title: s.title,
      paragraphs: s.paragraphs.map((p) => ({ original: p.original, modern: p.modern })),
    })),
  }));

const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};
const removeAt = (arr, i) => arr.filter((_, k) => k !== i);
const insertAt = (arr, i, item) => [...arr.slice(0, i), item, ...arr.slice(i)];
const newParagraph = () => ({ _k: key(), original: '', modern: '' });
const newSection = () => ({ _k: key(), title: '', paragraphs: [newParagraph()] });

const EMPTY_META = { title: '', author: '', year: '', description: '', cover_url: '', published: true };

function CoverSearch({ title, author, onPick, onClose }) {
  const [results, setResults] = useState(null);
  const [q, setQ] = useState({ title, author });
  const [error, setError] = useState('');
  const search = () => {
    setResults(null);
    setError('');
    api(`/admin/covers?title=${encodeURIComponent(q.title)}&author=${encodeURIComponent(q.author)}`)
      .then((d) => setResults(d.results))
      .catch((e) => setError(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(search, []);
  return (
    <Modal title="Find cover artwork" onClose={onClose} wide>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} placeholder="Title" aria-label="Title" />
        <input value={q.author} onChange={(e) => setQ({ ...q, author: e.target.value })} placeholder="Author" aria-label="Author" />
        <button className="btn">Search</button>
      </form>
      {error && <div className="error">{error}</div>}
      {!results && !error && <p className="muted">Searching Open Library, Google Books and Wikipedia…</p>}
      {results?.length === 0 && <p className="muted">No artwork found. Try a shorter title, or paste an image link instead.</p>}
      <div className="cover-results">
        {results?.map((r) => (
          <button key={r.url} className="cover-result" onClick={() => onPick(r.url)} title={r.label}>
            <img src={r.url} alt={r.label} loading="lazy" />
            <span className="small muted">{r.source}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ImportDialog({ onImport, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const parse = (raw) => {
    try {
      const data = JSON.parse(raw);
      const book = Array.isArray(data) ? { chapters: data } : data;
      if (!Array.isArray(book.chapters)) throw new Error('The JSON needs a "chapters" array.');
      onImport(book);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Modal title="Import book content" onClose={onClose} wide>
      <p>
        Load a book from a JSON file (the format is in <code>docs/ADMIN_API.md</code>; the download button on the Books list produces
        the same format). It replaces the contents shown in the editor. Nothing is saved until you press <strong>Save</strong>.
      </p>
      <div className="row">
        <button className="btn" onClick={() => fileRef.current.click()}>
          <Icon name="upload" size={18} /> Choose a .json file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files[0];
            if (f) parse(await f.text());
          }}
        />
      </div>
      <label>
        …or paste JSON
        <textarea rows={10} className="mono" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={!text.trim()} onClick={() => parse(text)}>
          Import
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

const ParagraphRow = memo(function ParagraphRow({ p, index, count, onChange, onMove, onRemove, onInsert }) {
  return (
    <div className="para-edit">
      <div className="para-edit-num">{index + 1}</div>
      <label>
        <span className="small muted">Original</span>
        <textarea value={p.original} onChange={(e) => onChange(index, { ...p, original: e.target.value })} rows={4} />
      </label>
      <label>
        <span className="small muted">Modern</span>
        <textarea value={p.modern} onChange={(e) => onChange(index, { ...p, modern: e.target.value })} rows={4} />
      </label>
      <div className="para-edit-tools">
        <button className="icon-btn" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Move up">
          <Icon name="up" size={16} />
        </button>
        <button className="icon-btn" disabled={index === count - 1} onClick={() => onMove(index, 1)} aria-label="Move down">
          <Icon name="down" size={16} />
        </button>
        <button className="icon-btn" onClick={() => onInsert(index + 1)} aria-label="Insert paragraph below">
          <Icon name="plus" size={16} />
        </button>
        <button className="icon-btn danger" onClick={() => onRemove(index)} aria-label="Delete paragraph">
          <Icon name="trash" size={16} />
        </button>
      </div>
    </div>
  );
});

function SectionEditor({ section, si, count, onChange, onMove, onRemove }) {
  const setParas = (fn) => onChange({ ...section, paragraphs: fn(section.paragraphs) });
  return (
    <div className="section-edit">
      <div className="section-edit-head">
        <input
          value={section.title}
          placeholder={`Section ${si + 1} title (optional)`}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          aria-label="Section title"
        />
        <button className="icon-btn" disabled={si === 0} onClick={() => onMove(-1)} aria-label="Move section up">
          <Icon name="up" size={16} />
        </button>
        <button className="icon-btn" disabled={si === count - 1} onClick={() => onMove(1)} aria-label="Move section down">
          <Icon name="down" size={16} />
        </button>
        <button
          className="icon-btn danger"
          onClick={() => confirm('Delete this section and its paragraphs?') && onRemove()}
          aria-label="Delete section"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
      {section.paragraphs.map((p, pi) => (
        <ParagraphRow
          key={p._k}
          p={p}
          index={pi}
          count={section.paragraphs.length}
          onChange={(i, np) => setParas((ps) => ps.map((x, k) => (k === i ? np : x)))}
          onMove={(i, d) => setParas((ps) => move(ps, i, d))}
          onRemove={(i) => setParas((ps) => removeAt(ps, i))}
          onInsert={(i) => setParas((ps) => insertAt(ps, i, newParagraph()))}
        />
      ))}
      <button className="btn small" onClick={() => setParas((ps) => [...ps, newParagraph()])}>
        <Icon name="plus" size={16} /> Add paragraph
      </button>
    </div>
  );
}

export default function BookEditor() {
  const { bookId } = useParams();
  const isNew = bookId === 'new';
  const navigate = useNavigate();
  const [meta, setMeta] = useState(EMPTY_META);
  const [chapters, setChapters] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const [coverSearch, setCoverSearch] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (isNew) {
      setMeta(EMPTY_META);
      setChapters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api(`/admin/books/${bookId}`)
      .then(({ book }) => {
        setMeta({
          title: book.title,
          author: book.author,
          year: book.year ?? '',
          description: book.description,
          cover_url: book.cover_url,
          published: book.published,
        });
        setChapters(withKeys(book.chapters));
        setDirty(false);
      })
      .catch((e) => setMsg({ error: e.message, ok: '' }))
      .finally(() => setLoading(false));
  }, [bookId, isNew]);

  // Warn before leaving with unsaved changes.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (confirm('You have unsaved changes. Leave without saving?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const changeMeta = (k) => (e) => {
    setMeta({ ...meta, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    setDirty(true);
  };
  const changeChapters = (fn) => {
    setChapters(fn);
    setDirty(true);
  };
  const editChapter = (ci, fn) => changeChapters((chs) => chs.map((c, i) => (i === ci ? fn(c) : c)));

  const save = async () => {
    if (!meta.title.trim()) {
      setMsg({ error: 'A title is required.', ok: '' });
      return;
    }
    setBusy(true);
    setMsg({ error: '', ok: '' });
    const body = { ...meta, chapters: stripKeys(chapters) };
    try {
      if (isNew) {
        const { book } = await api('/admin/books', { method: 'POST', body });
        setDirty(false);
        // Allow the navigation (dirty state updates asynchronously).
        setTimeout(() => navigate(`/admin/books/${book.id}`, { replace: true }), 0);
      } else {
        const { book } = await api(`/admin/books/${bookId}`, { method: 'PUT', body });
        setMeta((m) => ({ ...m, cover_url: book.cover_url }));
        setDirty(false);
        setMsg({ error: '', ok: 'Saved.' });
      }
    } catch (e) {
      setMsg({ error: e.message, ok: '' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page muted">Loading…</div>;

  const counts = chapters.reduce(
    (acc, c) => {
      acc.sections += c.sections.length;
      acc.paragraphs += c.sections.reduce((n, s) => n + s.paragraphs.length, 0);
      return acc;
    },
    { sections: 0, paragraphs: 0 },
  );

  return (
    <div className="page wide editor">
      <div className="toolbar">
        <div>
          <Link to="/admin?tab=books" className="muted small">
            ← All books
          </Link>
          <h1>{isNew ? 'Add a book' : `Edit: ${meta.title}`}</h1>
        </div>
        {!isNew && (
          <Link className="btn ghost" to={`/books/${bookId}`}>
            View as reader
          </Link>
        )}
      </div>

      <section className="card">
        <h2>Details</h2>
        <div className="meta-grid">
          <div className="meta-cover">
            <Cover book={meta} size="md" />
            <button className="btn small" onClick={() => setCoverSearch(true)} disabled={!meta.title}>
              <Icon name="image" size={16} /> Find artwork online
            </button>
          </div>
          <div className="form">
            <label>
              Title
              <input required value={meta.title} onChange={changeMeta('title')} />
            </label>
            <div className="row two">
              <label>
                Author
                <input value={meta.author} onChange={changeMeta('author')} />
              </label>
              <label>
                Year
                <input type="number" value={meta.year} onChange={changeMeta('year')} />
              </label>
            </div>
            <label>
              Description
              <textarea rows={3} value={meta.description} onChange={changeMeta('description')} />
            </label>
            <label>
              Cover image link <span className="muted">(leave blank to find one automatically when the book is created)</span>
              <input value={meta.cover_url} onChange={changeMeta('cover_url')} placeholder="https://…" />
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={meta.published} onChange={changeMeta('published')} /> Visible to readers in the library
            </label>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>
            Contents <span className="muted small">{chapters.length} chapters · {counts.sections} sections · {counts.paragraphs} paragraphs</span>
          </h2>
          <button className="btn" onClick={() => setImporting(true)}>
            <Icon name="upload" size={18} /> Import JSON
          </button>
        </div>
        {!isNew && (
          <p className="muted small">
            Readers' notes stay attached to paragraphs by position, so prefer editing text in place over deleting and re-adding paragraphs.
          </p>
        )}
        {chapters.map((ch, ci) => (
          <div key={ch._k} className={`chapter-edit ${open === ch._k ? 'open' : ''}`}>
            <div className="chapter-edit-head">
              <button className="icon-btn" onClick={() => setOpen(open === ch._k ? null : ch._k)} aria-label={open === ch._k ? 'Collapse' : 'Expand'}>
                <Icon name={open === ch._k ? 'down' : 'right'} size={18} />
              </button>
              <input value={ch.title} onChange={(e) => editChapter(ci, (c) => ({ ...c, title: e.target.value }))} aria-label="Chapter title" />
              <span className="muted small nowrap">
                {ch.sections.length} sec · {ch.sections.reduce((n, s) => n + s.paragraphs.length, 0)} ¶
              </span>
              <button className="icon-btn" disabled={ci === 0} onClick={() => changeChapters((c) => move(c, ci, -1))} aria-label="Move chapter up">
                <Icon name="up" size={16} />
              </button>
              <button
                className="icon-btn"
                disabled={ci === chapters.length - 1}
                onClick={() => changeChapters((c) => move(c, ci, 1))}
                aria-label="Move chapter down"
              >
                <Icon name="down" size={16} />
              </button>
              <button
                className="icon-btn danger"
                onClick={() => confirm(`Delete “${ch.title}” and everything in it?`) && changeChapters((c) => removeAt(c, ci))}
                aria-label="Delete chapter"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
            {open === ch._k && (
              <div className="chapter-edit-body">
                {ch.sections.map((s, si) => (
                  <SectionEditor
                    key={s._k}
                    section={s}
                    si={si}
                    count={ch.sections.length}
                    onChange={(ns) => editChapter(ci, (c) => ({ ...c, sections: c.sections.map((x, k) => (k === si ? ns : x)) }))}
                    onMove={(d) => editChapter(ci, (c) => ({ ...c, sections: move(c.sections, si, d) }))}
                    onRemove={() => editChapter(ci, (c) => ({ ...c, sections: removeAt(c.sections, si) }))}
                  />
                ))}
                <button className="btn small" onClick={() => editChapter(ci, (c) => ({ ...c, sections: [...c.sections, newSection()] }))}>
                  <Icon name="plus" size={16} /> Add section
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          className="btn"
          onClick={() => {
            const ch = { _k: key(), title: `Chapter ${chapters.length + 1}`, sections: [newSection()] };
            changeChapters((c) => [...c, ch]);
            setOpen(ch._k);
          }}
        >
          <Icon name="plus" size={18} /> Add chapter
        </button>
      </section>

      <div className="save-bar">
        {msg.error && <span className="error inline">{msg.error}</span>}
        {msg.ok && !dirty && <span className="success inline">{msg.ok}</span>}
        {dirty && <span className="muted small">Unsaved changes</span>}
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : isNew ? 'Create book' : 'Save'}
        </button>
      </div>

      {coverSearch && (
        <CoverSearch
          title={meta.title}
          author={meta.author}
          onClose={() => setCoverSearch(false)}
          onPick={(url) => {
            setMeta({ ...meta, cover_url: url });
            setDirty(true);
            setCoverSearch(false);
          }}
        />
      )}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImport={(book) => {
            setChapters(withKeys(book.chapters));
            setMeta((m) => ({
              ...m,
              title: m.title || book.title || '',
              author: m.author || book.author || '',
              year: m.year || book.year || '',
              description: m.description || book.description || '',
              cover_url: m.cover_url || book.cover_url || '',
            }));
            setDirty(true);
            setImporting(false);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

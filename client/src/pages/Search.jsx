import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatDateTime } from '../lib/api.js';
import Cover from '../components/Cover.jsx';

/** Renders a search snippet where matches are wrapped in [[[ ]]] by the server. */
function Snippet({ text }) {
  const parts = String(text || '').split(/(\[\[\[.*?\]\]\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('[[[') ? <mark key={i}>{part.slice(3, -3)}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

/** Highlights plain-text occurrences of the query (used for notes). */
function Highlight({ text, q }) {
  if (!q) return text;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${esc})`, 'gi'));
  return parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setInput(q), [q]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setBusy(true);
    setError('');
    api(`/search?q=${encodeURIComponent(q)}`)
      .then(setResults)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [q]);

  const total = results ? results.books.length + results.passages.length + results.notes.length : 0;

  return (
    <div className="page">
      <h1>Search</h1>
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(input.trim() ? { q: input.trim() } : {});
        }}
      >
        <input
          type="search"
          autoFocus={!q}
          placeholder='Search every book and your notes, e.g. "assurance" or "sin of unbelief"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Search"
        />
        <button className="btn primary">Search</button>
      </form>
      <p className="muted small">Searches both the original and modern text of every book, plus your own notes. Put a phrase in quotes to match it exactly.</p>

      {error && <div className="error">{error}</div>}
      {busy && <p className="muted">Searching…</p>}
      {results && !busy && total === 0 && <p className="muted">Nothing found for “{q}”.</p>}

      {results?.books.length > 0 && (
        <section>
          <h2>Books</h2>
          <div className="search-books">
            {results.books.map((b) => (
              <Link key={b.id} to={`/books/${b.id}`} className="search-book">
                <Cover book={b} size="xs" />
                <div>
                  <div className="book-tile-title">{b.title}</div>
                  <div className="muted small">
                    {b.author}
                    {b.year ? ` · ${b.year}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results?.notes.length > 0 && (
        <section>
          <h2>Your notes ({results.notes.length})</h2>
          {results.notes.map((n) => (
            <Link key={n.id} className="card result" to={`/read/${n.book_id}/${n.section_id}#p-${n.paragraph_id}`}>
              <div className="result-where">
                {n.book_title} · {n.chapter_title}
                {n.section_title ? ` › ${n.section_title}` : ''}
              </div>
              <p>
                <Highlight text={n.body} q={q.replace(/"/g, '')} />
              </p>
              <div className="muted small">{formatDateTime(n.updated_at)}</div>
            </Link>
          ))}
        </section>
      )}

      {results?.passages.length > 0 && (
        <section>
          <h2>In the books ({results.passages.length}{results.passages.length === 60 ? '+' : ''})</h2>
          {results.passages.map((p) => {
            const showOriginal = p.original_hit && !p.modern_hit;
            return (
              <Link key={p.paragraph_id} className="card result" to={`/read/${p.book_id}/${p.section_id}#p-${p.paragraph_id}`}>
                <div className="result-where">
                  {p.book_title} · {p.chapter_title}
                  {p.section_title ? ` › ${p.section_title}` : ''}
                </div>
                <p className={showOriginal ? 'original' : ''}>
                  <Snippet text={showOriginal ? p.original_snippet : p.modern_snippet} />
                </p>
                {showOriginal && <div className="muted small">Found in the original text</div>}
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

const cache = new Map();

/** Finds the word under a screen point and returns a Range covering it (or null). */
export function wordRangeAt(x, y) {
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  const node = range?.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent;
  const isWordChar = (c) => /[\p{L}'’-]/u.test(c || '');
  let start = range.startOffset;
  let end = start;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;
  // Don't include leading/trailing apostrophes or hyphens.
  while (start < end && /['’-]/.test(text[start])) start++;
  while (end > start && /['’-]/.test(text[end - 1])) end--;
  if (start === end) return null;
  const r = document.createRange();
  r.setStart(node, start);
  r.setEnd(node, end);
  return r;
}

export default function DefinitionPopover({ word, rect, onClose }) {
  const [data, setData] = useState(() => cache.get(word.toLowerCase()) || null);
  const [error, setError] = useState('');
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const key = word.toLowerCase();
    if (cache.has(key)) {
      setData(cache.get(key));
      return;
    }
    setData(null);
    setError('');
    api(`/define?word=${encodeURIComponent(word)}`)
      .then((d) => {
        cache.set(key, d);
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [word]);

  // Place under the word (or above it if there isn't room). Small screens use a bottom sheet via CSS.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || window.innerWidth < 640) {
      setPos(null);
      return;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, rect.left + rect.width / 2 - w / 2));
    const below = rect.bottom + 10;
    const top = below + h > window.innerHeight - 12 ? Math.max(12, rect.top - h - 10) : below;
    setPos({ left, top });
  }, [rect, data, error]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.para-text')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const found = data && (data.glossary || data.dictionary);

  return createPortal(
    <div
      ref={ref}
      className={`define-pop ${pos ? 'floating' : 'sheet'}`}
      style={pos ? { left: pos.left, top: pos.top } : undefined}
      role="dialog"
      aria-label={`Definition of ${word}`}
    >
      <div className="define-head">
        <span className="define-word">{word}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>
      {!data && !error && <p className="muted small">Looking it up…</p>}
      {error && <p className="error">{error}</p>}
      {data?.glossary && (
        <div className="define-block">
          <div className="define-label">In older and Puritan writing</div>
          <p>{data.glossary.definition}</p>
        </div>
      )}
      {data?.dictionary && (
        <div className="define-block">
          <div className="define-label">
            Dictionary{data.dictionary.lookedUp && data.dictionary.lookedUp !== data.word ? ` · “${data.dictionary.lookedUp}”` : ''}
          </div>
          {data.dictionary.entries.map((e, i) => (
            <div key={i} className="define-entry">
              {e.partOfSpeech && <em className="muted small">{e.partOfSpeech}</em>}
              <ol>
                {e.definitions.map((d, j) => (
                  <li key={j}>{d}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {data && !found && <p className="muted">No definition found for “{data.word}”.</p>}
      <div className="define-foot">
        {data?.dictionary?.url ? (
          <a href={data.dictionary.url} target="_blank" rel="noreferrer" className="small">
            Source: {data.dictionary.source}
          </a>
        ) : (
          <span className="small muted">{data?.dictionary ? `Source: ${data.dictionary.source}` : ''}</span>
        )}
        <Link className="small" to={`/search?q=${encodeURIComponent(word)}`} onClick={onClose}>
          Find in the library
        </Link>
      </div>
    </div>,
    document.body,
  );
}

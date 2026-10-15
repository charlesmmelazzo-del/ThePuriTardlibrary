import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { wordRangeAt } from './DefinitionPopover.jsx';

const sideOf = (rotation) => ((Math.round(rotation / 180) % 2) + 2) % 2 === 0 ? 'modern' : 'original';

/**
 * A paragraph shown as a two-sided card: modern English on the front, the original on the back.
 * Swipe sideways (touch) or press the flip button to turn it over.
 */
export default function FlipCard({
  paragraph,
  side,
  year,
  noteCount,
  highlighted,
  glossary,
  bookmarked,
  onDefine,
  onAddNote,
  onShare,
  onBookmark,
}) {
  const [rotation, setRotation] = useState(side === 'original' ? 180 : 0);
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  const swiped = useRef(0);
  const shown = sideOf(rotation);

  // Follow the reader-wide Modern/Original toggle.
  useEffect(() => {
    setRotation((r) => (sideOf(r) === side ? r : r + 180));
  }, [side]);

  const flip = (dir = 1) => setRotation((r) => r + 180 * dir);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return; // mouse users use the flip button so text selection still works
    start.current = { x: e.clientX, y: e.clientY, horizontal: null };
  };
  const onPointerMove = (e) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.horizontal = Math.abs(dx) > Math.abs(dy);
    if (s.horizontal) setDrag(Math.max(-50, Math.min(50, dx / 3)));
  };
  const onPointerUp = (e) => {
    const s = start.current;
    start.current = null;
    setDrag(0);
    if (!s?.horizontal) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 45) {
      swiped.current = Date.now();
      flip(dx > 0 ? 1 : -1);
    }
  };
  const cancel = () => {
    start.current = null;
    setDrag(0);
  };

  // Glossary mode: tap a word (or select a phrase) to look it up.
  const onTextClick = (e) => {
    if (!glossary || Date.now() - swiped.current < 400) return;
    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    if (selected && selected.split(/\s+/).length <= 5 && e.currentTarget.contains(sel.anchorNode)) {
      onDefine(selected, sel.getRangeAt(0).getBoundingClientRect());
      return;
    }
    const range = wordRangeAt(e.clientX, e.clientY);
    if (!range || !e.currentTarget.contains(range.startContainer)) return;
    sel.removeAllRanges();
    sel.addRange(range);
    onDefine(range.toString(), range.getBoundingClientRect());
  };

  const face = (which) => {
    const text = which === 'modern' ? paragraph.modern : paragraph.original;
    return (
      <div className={`flip-face ${which === 'modern' ? 'front' : 'back'}`} aria-hidden={shown !== which}>
        <div className="face-label">
          {which === 'modern' ? 'Modern English' : `Original${year ? ` · ${year}` : ''}`}
        </div>
        {text ? (
          <p className={`para-text ${which} ${glossary ? 'glossary-on' : ''}`} onClick={shown === which ? onTextClick : undefined}>
            {text}
          </p>
        ) : (
          <p className="para-text muted">
            <em>No {which === 'modern' ? 'modern rendering' : 'original text'} for this paragraph.</em>
          </p>
        )}
      </div>
    );
  };

  return (
    <article className={`para ${highlighted ? 'highlight' : ''}`} id={`p-${paragraph.id}`}>
      <div
        className="flip-scene"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
      >
        <div className={`flip-inner ${drag ? 'dragging' : ''}`} style={{ transform: `rotateY(${rotation + drag}deg)` }}>
          {face('modern')}
          {face('original')}
        </div>
      </div>
      <div className="para-actions">
        <button
          className={`para-btn bookmark-btn ${bookmarked ? 'on' : ''}`}
          onClick={onBookmark}
          aria-pressed={!!bookmarked}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this paragraph'}
          title={bookmarked ? 'Remove bookmark' : 'Bookmark: open here next time'}
        >
          <Icon name="bookmark" size={18} className={bookmarked ? 'filled' : ''} />
          <span>{bookmarked ? 'Bookmarked' : 'Bookmark'}</span>
        </button>
        <button className="para-btn" onClick={() => flip(1)} aria-label={`Show ${shown === 'modern' ? 'original' : 'modern'} text`}>
          <Icon name="flip" size={18} />
          <span>{shown === 'modern' ? 'Original' : 'Modern'}</span>
        </button>
        <button className="para-btn" onClick={onAddNote} aria-label="Add a note">
          <Icon name="note" size={18} />
          <span>{noteCount ? `Notes (${noteCount})` : 'Note'}</span>
        </button>
        <button className="para-btn" onClick={() => onShare(shown)} aria-label="Share this paragraph">
          <Icon name="share" size={18} />
          <span>Share</span>
        </button>
      </div>
    </article>
  );
}

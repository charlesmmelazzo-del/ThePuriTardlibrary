import { useState } from 'react';

const palettes = [
  ['#5b2a2a', '#e8d9b8'],
  ['#233a4a', '#e6dcc4'],
  ['#2f4232', '#ece2c9'],
  ['#4a3a22', '#efe3c6'],
  ['#3b2d48', '#e7dcc9'],
  ['#1f2f2f', '#e0d6bd'],
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Book cover image, falling back to a typeset cover when there is no artwork. */
export default function Cover({ book, size = 'md' }) {
  const [failed, setFailed] = useState(false);
  if (book.cover_url && !failed) {
    return (
      <div className={`cover cover-${size}`}>
        <img src={book.cover_url} alt={`Cover of ${book.title}`} loading="lazy" onError={() => setFailed(true)} />
      </div>
    );
  }
  const [bg, fg] = palettes[hash(book.title || '') % palettes.length];
  return (
    <div className={`cover cover-${size} cover-typeset`} style={{ background: bg, color: fg }} aria-label={`Cover of ${book.title}`}>
      <div className="cover-rule" />
      <div className="cover-title">{book.title}</div>
      <div className="cover-rule" />
      {book.author && <div className="cover-author">{book.author}</div>}
    </div>
  );
}

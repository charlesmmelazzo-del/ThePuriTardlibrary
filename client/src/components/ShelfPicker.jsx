import { useState } from 'react';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

/** Choose which shelves a book is on, or start a new shelf with it. */
export default function ShelfPicker({ book, shelves, toggle, create, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal title="Add to shelf" onClose={onClose}>
      <p className="muted small">
        Choose shelves for <em>{book.title}</em>.
      </p>
      <ul className="shelf-options">
        {(shelves || []).map((s) => {
          const on = s.book_ids.includes(book.id);
          return (
            <li key={s.id}>
              <label className="checkbox">
                <input type="checkbox" checked={on} onChange={() => toggle(s, book.id).catch((e) => setError(e.message))} />
                <Icon name={s.is_default ? 'bookmark' : 'shelf'} size={18} />
                <span className="grow">{s.name}</span>
                <span className="muted small">{s.book_ids.length}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setError('');
          try {
            await create(name.trim(), book.id);
            setName('');
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <input placeholder="New shelf name, e.g. Read with my wife" value={name} onChange={(e) => setName(e.target.value)} aria-label="New shelf name" />
        <button className="btn" disabled={!name.trim()}>
          <Icon name="plus" size={16} /> Create
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

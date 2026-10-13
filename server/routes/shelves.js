// Personal shelves: a default "My Shelf" plus any number of named shelves (like playlists).
import { Router } from 'express';
import { query } from '../db.js';
import { requireUser } from '../auth.js';

const router = Router();
router.use(requireUser);

const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

async function ensureDefault(userId) {
  await query(
    `INSERT INTO shelves (user_id, name, is_default) VALUES ($1, 'My Shelf', TRUE)
     ON CONFLICT (user_id) WHERE is_default DO NOTHING`,
    [userId],
  );
}

async function ownShelf(req, id) {
  const { rows } = await query('SELECT * FROM shelves WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  return rows[0] || null;
}

// All my shelves with their book ids.
router.get('/', async (req, res) => {
  await ensureDefault(req.user.id);
  const { rows } = await query(
    `SELECT s.id, s.name, s.is_default, s.created_at,
            coalesce(array_agg(sb.book_id ORDER BY sb.added_at DESC) FILTER (WHERE sb.book_id IS NOT NULL), '{}') AS book_ids
     FROM shelves s LEFT JOIN shelf_books sb ON sb.shelf_id = s.id
     WHERE s.user_id = $1
     GROUP BY s.id
     ORDER BY s.is_default DESC, s.created_at`,
    [req.user.id],
  );
  res.json({ shelves: rows });
});

router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Give your shelf a name.' });
  const { rows } = await query('INSERT INTO shelves (user_id, name) VALUES ($1, $2) RETURNING *', [req.user.id, name]);
  const shelf = rows[0];
  const bookId = intParam(req.body.book_id);
  if (bookId) await query('INSERT INTO shelf_books (shelf_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [shelf.id, bookId]);
  res.status(201).json({ shelf: { ...shelf, book_ids: bookId ? [bookId] : [] } });
});

router.patch('/:id', async (req, res) => {
  const shelf = await ownShelf(req, intParam(req.params.id));
  if (!shelf) return res.status(404).json({ error: 'Shelf not found.' });
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Give your shelf a name.' });
  const { rows } = await query('UPDATE shelves SET name = $2 WHERE id = $1 RETURNING *', [shelf.id, name]);
  res.json({ shelf: rows[0] });
});

router.delete('/:id', async (req, res) => {
  const shelf = await ownShelf(req, intParam(req.params.id));
  if (!shelf) return res.status(404).json({ error: 'Shelf not found.' });
  if (shelf.is_default) return res.status(400).json({ error: 'Your main shelf can’t be deleted.' });
  await query('DELETE FROM shelves WHERE id = $1', [shelf.id]);
  res.json({ ok: true });
});

router.put('/:id/books/:bookId', async (req, res) => {
  const shelf = await ownShelf(req, intParam(req.params.id));
  if (!shelf) return res.status(404).json({ error: 'Shelf not found.' });
  const book = await query('SELECT id FROM books WHERE id = $1', [intParam(req.params.bookId)]);
  if (!book.rows[0]) return res.status(404).json({ error: 'Book not found.' });
  await query('INSERT INTO shelf_books (shelf_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [shelf.id, book.rows[0].id]);
  res.json({ ok: true });
});

router.delete('/:id/books/:bookId', async (req, res) => {
  const shelf = await ownShelf(req, intParam(req.params.id));
  if (!shelf) return res.status(404).json({ error: 'Shelf not found.' });
  await query('DELETE FROM shelf_books WHERE shelf_id = $1 AND book_id = $2', [shelf.id, intParam(req.params.bookId)]);
  res.json({ ok: true });
});

export default router;

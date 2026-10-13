// Per-reader features: notes, reading goals and global search.
import { Router } from 'express';
import { query } from '../db.js';
import { requireUser } from '../auth.js';
import { daysBetween, goalStatus, isDate, todayFrom } from '../lib/goals.js';

const router = Router();
router.use(requireUser);

const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/* ---------------- Notes ---------------- */

router.get('/notes', async (req, res) => {
  const params = [req.user.id];
  let where = 'n.user_id = $1';
  const bookId = intParam(req.query.book_id);
  if (bookId) {
    params.push(bookId);
    where += ` AND n.book_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT n.id, n.body, n.created_at, n.updated_at, n.paragraph_id, n.book_id,
            b.title AS book_title, b.author AS book_author,
            p.original, p.modern, s.id AS section_id, s.title AS section_title, c.title AS chapter_title
     FROM notes n
     JOIN books b ON b.id = n.book_id
     JOIN paragraphs p ON p.id = n.paragraph_id
     JOIN sections s ON s.id = p.section_id
     JOIN chapters c ON c.id = s.chapter_id
     WHERE ${where}
     ORDER BY n.updated_at DESC`,
    params,
  );
  res.json({ notes: rows });
});

router.post('/notes', async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Note cannot be empty.' });
  const p = await query('SELECT id, book_id FROM paragraphs WHERE id = $1', [intParam(req.body.paragraph_id)]);
  if (!p.rows[0]) return res.status(400).json({ error: 'Unknown paragraph.' });
  const { rows } = await query(
    'INSERT INTO notes (user_id, book_id, paragraph_id, body) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.user.id, p.rows[0].book_id, p.rows[0].id, body.slice(0, 20000)],
  );
  res.status(201).json({ note: rows[0] });
});

router.patch('/notes/:id', async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Note cannot be empty.' });
  const { rows } = await query(
    'UPDATE notes SET body = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *',
    [intParam(req.params.id), req.user.id, body.slice(0, 20000)],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Note not found.' });
  res.json({ note: rows[0] });
});

router.delete('/notes/:id', async (req, res) => {
  await query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [intParam(req.params.id), req.user.id]);
  res.json({ ok: true });
});

/* ---------------- Goals ---------------- */

router.get('/goals', async (req, res) => {
  const today = todayFrom(req);
  const { rows } = await query(
    `SELECT g.*, b.title AS book_title, b.author AS book_author, b.cover_url
     FROM goals g JOIN books b ON b.id = g.book_id
     WHERE g.user_id = $1 ORDER BY g.target_date`,
    [req.user.id],
  );
  const goals = await Promise.all(
    rows.map(async (g) => ({
      ...(await goalStatus({ query }, g, today)),
      book_title: g.book_title,
      book_author: g.book_author,
      cover_url: g.cover_url,
    })),
  );
  res.json({ goals });
});

// Create or replace the goal for a book. Body: { book_id, target_date, today }
router.post('/goals', async (req, res) => {
  const today = todayFrom(req);
  const bookId = intParam(req.body.book_id);
  const target = req.body.target_date;
  if (!isDate(target)) return res.status(400).json({ error: 'Choose a finish date.' });
  if (daysBetween(today, target) < 0) return res.status(400).json({ error: 'The finish date must be today or later.' });
  const book = await query('SELECT id FROM books WHERE id = $1', [bookId]);
  if (!book.rows[0]) return res.status(404).json({ error: 'Book not found.' });

  const prog = await query('SELECT max_seq FROM progress WHERE user_id = $1 AND book_id = $2', [req.user.id, bookId]);
  const { rows } = await query(
    `INSERT INTO goals (user_id, book_id, start_date, target_date, start_seq) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, book_id) DO UPDATE
     SET start_date = EXCLUDED.start_date, target_date = EXCLUDED.target_date,
         start_seq = EXCLUDED.start_seq, completed_at = NULL, created_at = now()
     RETURNING *`,
    [req.user.id, bookId, today, target, prog.rows[0]?.max_seq || 0],
  );
  res.status(201).json({ goal: await goalStatus({ query }, rows[0], today) });
});

router.delete('/goals/:id', async (req, res) => {
  await query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [intParam(req.params.id), req.user.id]);
  res.json({ ok: true });
});

/* ---------------- Search ---------------- */

// Searches book text (original + modern) across the library, book titles/authors, and the reader's own notes.
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (q.length < 2) return res.json({ q, books: [], passages: [], notes: [] });
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const bookId = intParam(req.query.book_id);
  const published = req.user.is_admin ? 'TRUE' : 'b.published';

  const passageParams = [q, like];
  let bookFilter = '';
  if (bookId) {
    passageParams.push(bookId);
    bookFilter = `AND p.book_id = $${passageParams.length}`;
  }

  const [books, passages, notes] = await Promise.all([
    query(
      `SELECT id, title, author, year, cover_url FROM books b
       WHERE ${published} AND (title ILIKE $1 OR author ILIKE $1 OR description ILIKE $1)
       ORDER BY title LIMIT 20`,
      [like],
    ),
    query(
      `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS tq)
       SELECT p.id AS paragraph_id, p.book_id, s.id AS section_id, s.title AS section_title,
              c.title AS chapter_title, b.title AS book_title, b.author AS book_author,
              ts_headline('english', p.modern, q.tq, 'StartSel=[[[,StopSel=]]],MaxFragments=2,MaxWords=30,MinWords=12') AS modern_snippet,
              ts_headline('english', p.original, q.tq, 'StartSel=[[[,StopSel=]]],MaxFragments=2,MaxWords=30,MinWords=12') AS original_snippet,
              (p.modern ILIKE $2) AS modern_hit, (p.original ILIKE $2) AS original_hit,
              ts_rank(p.tsv, q.tq) + CASE WHEN p.modern ILIKE $2 OR p.original ILIKE $2 THEN 1 ELSE 0 END AS rank
       FROM paragraphs p
       CROSS JOIN q
       JOIN sections s ON s.id = p.section_id
       JOIN chapters c ON c.id = s.chapter_id
       JOIN books b ON b.id = p.book_id
       WHERE ${published} ${bookFilter}
         AND (p.tsv @@ q.tq OR p.modern ILIKE $2 OR p.original ILIKE $2)
       ORDER BY rank DESC, b.title, p.seq
       LIMIT 60`,
      passageParams,
    ),
    query(
      `SELECT n.id, n.body, n.paragraph_id, n.book_id, n.updated_at, p.section_id,
              b.title AS book_title, s.title AS section_title, c.title AS chapter_title
       FROM notes n
       JOIN books b ON b.id = n.book_id
       JOIN paragraphs p ON p.id = n.paragraph_id
       JOIN sections s ON s.id = p.section_id
       JOIN chapters c ON c.id = s.chapter_id
       WHERE n.user_id = $1 AND (n.body ILIKE $2 OR to_tsvector('english', n.body) @@ websearch_to_tsquery('english', $3))
       ORDER BY n.updated_at DESC LIMIT 50`,
      [req.user.id, like, q],
    ),
  ]);

  res.json({ q, books: books.rows, passages: passages.rows, notes: notes.rows });
});

export default router;

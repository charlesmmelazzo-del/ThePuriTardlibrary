// Admin API: manage books (including full content import) and users.
// Usable from the admin panel (session cookie) or from scripts / AI agents with
// "Authorization: Bearer <token>" where the token comes from POST /api/auth/login.
import { Router } from 'express';
import { query, tx } from '../db.js';
import { hashPassword, normalizeEmail, publicUser, requireAdmin, validateCredentials } from '../auth.js';
import { ContentError, exportBook, normalizeChapters, normalizeMeta, replaceContent } from '../lib/content.js';
import { findCover, searchCovers } from '../lib/covers.js';

const router = Router();
router.use(requireAdmin);

const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

function handleContentError(res, err) {
  if (err instanceof ContentError) return res.status(400).json({ error: err.message });
  throw err;
}

/* ---------------- Overview ---------------- */

router.get('/stats', async (_req, res) => {
  const { rows } = await query(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM books) AS books,
    (SELECT count(*)::int FROM paragraphs) AS paragraphs,
    (SELECT count(*)::int FROM notes) AS notes,
    (SELECT count(*)::int FROM goals) AS goals,
    (SELECT count(DISTINCT user_id)::int FROM reading_days WHERE day >= current_date - 7) AS active_readers_7d`);
  res.json(rows[0]);
});

/* ---------------- Books ---------------- */

router.get('/books', async (_req, res) => {
  const { rows } = await query(
    `SELECT b.*,
       (SELECT count(*)::int FROM chapters c WHERE c.book_id = b.id) AS chapter_count,
       (SELECT count(*)::int FROM sections s WHERE s.book_id = b.id) AS section_count,
       (SELECT count(*)::int FROM paragraphs p WHERE p.book_id = b.id) AS paragraph_count,
       (SELECT count(*)::int FROM progress pr WHERE pr.book_id = b.id) AS reader_count
     FROM books b ORDER BY b.title`,
  );
  res.json({ books: rows });
});

router.get('/books/:id', async (req, res) => {
  const book = await exportBook({ query }, intParam(req.params.id));
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  res.json({ book });
});

// Create a book. Body: book metadata plus optional "chapters" (see lib/content.js for the format).
// If no cover_url is given, one is looked up online automatically (set "auto_cover": false to skip).
router.post('/books', async (req, res) => {
  const meta = normalizeMeta(req.body);
  if (!meta.title) return res.status(400).json({ error: 'A title is required.' });
  let chapters;
  try {
    chapters = req.body.chapters ? normalizeChapters(req.body.chapters) : [];
  } catch (err) {
    return handleContentError(res, err);
  }
  if (!meta.cover_url && req.body.auto_cover !== false) {
    meta.cover_url = await findCover(meta.title, meta.author).catch(() => '');
  }
  const id = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO books (title, author, year, description, cover_url, published)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [meta.title, meta.author || '', meta.year ?? null, meta.description || '', meta.cover_url || '', meta.published ?? true],
    );
    await replaceContent(client, rows[0].id, chapters);
    return rows[0].id;
  });
  res.status(201).json({ book: await exportBook({ query }, id) });
});

// Update metadata (title, author, year, description, cover_url, published) and, if "chapters"
// is included, replace the content too.
router.put('/books/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const exists = await query('SELECT id FROM books WHERE id = $1', [id]);
  if (!exists.rows[0]) return res.status(404).json({ error: 'Book not found.' });
  const meta = normalizeMeta(req.body);
  if ('title' in meta && !meta.title) return res.status(400).json({ error: 'A title is required.' });
  let chapters = null;
  try {
    if (req.body.chapters) chapters = normalizeChapters(req.body.chapters);
  } catch (err) {
    return handleContentError(res, err);
  }
  await tx(async (client) => {
    const cols = Object.keys(meta);
    if (cols.length) {
      await client.query(
        `UPDATE books SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
        [id, ...cols.map((c) => meta[c])],
      );
    }
    if (chapters) await replaceContent(client, id, chapters);
  });
  res.json({ book: await exportBook({ query }, id) });
});

// Replace only the content. Body: { "chapters": [...] }
router.put('/books/:id/content', async (req, res) => {
  const id = intParam(req.params.id);
  const exists = await query('SELECT id FROM books WHERE id = $1', [id]);
  if (!exists.rows[0]) return res.status(404).json({ error: 'Book not found.' });
  let chapters;
  try {
    chapters = normalizeChapters(req.body.chapters);
  } catch (err) {
    return handleContentError(res, err);
  }
  await tx((client) => replaceContent(client, id, chapters));
  res.json({ book: await exportBook({ query }, id) });
});

// Append chapters to the end of a book (handy for importing a long book in pieces).
router.post('/books/:id/chapters', async (req, res) => {
  const id = intParam(req.params.id);
  const current = await exportBook({ query }, id);
  if (!current) return res.status(404).json({ error: 'Book not found.' });
  let added;
  try {
    added = normalizeChapters(req.body.chapters);
  } catch (err) {
    return handleContentError(res, err);
  }
  const chapters = normalizeChapters([...current.chapters, ...added]);
  await tx((client) => replaceContent(client, id, chapters));
  res.json({ book: await exportBook({ query }, id) });
});

// Edit a single paragraph. Body: { original?, modern? }
router.patch('/paragraphs/:id', async (req, res) => {
  const { rows: found } = await query('SELECT id, original, modern FROM paragraphs WHERE id = $1', [intParam(req.params.id)]);
  if (!found[0]) return res.status(404).json({ error: 'Paragraph not found.' });
  const original = typeof req.body.original === 'string' ? req.body.original.trim() : found[0].original;
  const modern = typeof req.body.modern === 'string' ? req.body.modern.trim() : found[0].modern;
  const words = ((modern || original).match(/\S+/g) || []).length;
  const { rows } = await query(
    'UPDATE paragraphs SET original = $2, modern = $3, word_count = $4 WHERE id = $1 RETURNING id, original, modern',
    [found[0].id, original, modern, words],
  );
  res.json({ paragraph: rows[0] });
});

router.delete('/books/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM books WHERE id = $1', [intParam(req.params.id)]);
  if (!rowCount) return res.status(404).json({ error: 'Book not found.' });
  res.json({ ok: true });
});

// Look for cover art online. Query: ?title=&author=
router.get('/covers', async (req, res) => {
  const title = String(req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  res.json({ results: await searchCovers(title, String(req.query.author || '').trim()) });
});

/* ---------------- Users ---------------- */

router.get('/users', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { rows } = await query(
    `SELECT u.*,
       (SELECT count(*)::int FROM notes n WHERE n.user_id = u.id) AS note_count,
       (SELECT count(*)::int FROM progress p WHERE p.user_id = u.id) AS books_started,
       (SELECT count(*)::int FROM goals g WHERE g.user_id = u.id) AS goal_count
     FROM users u
     WHERE $1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%'
     ORDER BY u.created_at DESC`,
    [q],
  );
  res.json({
    users: rows.map((u) => ({
      ...publicUser(u),
      note_count: u.note_count,
      books_started: u.books_started,
      goal_count: u.goal_count,
    })),
  });
});

router.post('/users', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const problem = validateCredentials(email, req.body.password);
  if (problem) return res.status(400).json({ error: problem });
  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) return res.status(409).json({ error: 'That email is already registered.' });
  const { rows } = await query(
    'INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
    [email, await hashPassword(req.body.password), String(req.body.name || '').trim(), Boolean(req.body.is_admin)],
  );
  res.status(201).json({ user: publicUser(rows[0]) });
});

// Edit a user. Body may include: email, name, is_admin, password (sets a new password and signs them out).
router.patch('/users/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const sets = [];
  const params = [id];
  const set = (sql, val) => {
    params.push(val);
    sets.push(sql.replace('?', `$${params.length}`));
  };
  if (req.body.email !== undefined) {
    const email = normalizeEmail(req.body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email.' });
    const taken = await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, id]);
    if (taken.rowCount) return res.status(409).json({ error: 'That email is already used by another account.' });
    set('email = ?', email);
  }
  if (typeof req.body.name === 'string') set('name = ?', req.body.name.trim());
  if (typeof req.body.is_admin === 'boolean') {
    if (id === req.user.id && !req.body.is_admin) return res.status(400).json({ error: "You can't remove your own admin access." });
    set('is_admin = ?', req.body.is_admin);
  }
  if (req.body.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    set('password_hash = ?', await hashPassword(req.body.password));
    sets.push('token_version = token_version + 1');
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUser(rows[0]) });
});

router.delete('/users/:id', async (req, res) => {
  const id = intParam(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account here." });
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

export default router;

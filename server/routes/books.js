import { Router } from 'express';
import { query } from '../db.js';
import { requireUser } from '../auth.js';
import { goalStatus, todayFrom } from '../lib/goals.js';

const router = Router();
router.use(requireUser);

const visible = (req) => (req.user.is_admin ? 'TRUE' : 'b.published');
const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

async function getBook(req, id) {
  const { rows } = await query(`SELECT * FROM books b WHERE b.id = $1 AND ${visible(req)}`, [id]);
  return rows[0] || null;
}

// Library list with each reader's progress.
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.title, b.author, b.year, b.description, b.cover_url, b.published, b.created_at,
            coalesce(pc.total, 0) AS total_paragraphs,
            coalesce(cc.chapters, 0) AS chapter_count,
            coalesce(pr.max_seq, 0) AS max_seq,
            pr.section_id AS resume_section_id,
            pr.updated_at AS last_read_at,
            (g.id IS NOT NULL) AS has_goal
     FROM books b
     LEFT JOIN (SELECT book_id, count(*)::int AS total FROM paragraphs GROUP BY book_id) pc ON pc.book_id = b.id
     LEFT JOIN (SELECT book_id, count(*)::int AS chapters FROM chapters GROUP BY book_id) cc ON cc.book_id = b.id
     LEFT JOIN progress pr ON pr.book_id = b.id AND pr.user_id = $1
     LEFT JOIN goals g ON g.book_id = b.id AND g.user_id = $1
     WHERE ${visible(req)}
     ORDER BY b.title`,
    [req.user.id],
  );
  res.json({
    books: rows.map((b) => ({
      ...b,
      percent: b.total_paragraphs ? Math.min(100, Math.round((b.max_seq / b.total_paragraphs) * 100)) : 0,
    })),
  });
});

// Book details, table of contents, progress and goal.
router.get('/:id', async (req, res) => {
  const book = await getBook(req, intParam(req.params.id));
  if (!book) return res.status(404).json({ error: 'Book not found.' });

  const [chapters, sections, prog, goal] = await Promise.all([
    query('SELECT id, title FROM chapters WHERE book_id = $1 ORDER BY position, id', [book.id]),
    query(
      `SELECT s.id, s.chapter_id, s.title, count(p.id)::int AS paragraphs,
              coalesce(min(p.seq), 0) AS first_seq, coalesce(max(p.seq), 0) AS last_seq
       FROM sections s LEFT JOIN paragraphs p ON p.section_id = s.id
       WHERE s.book_id = $1 GROUP BY s.id ORDER BY s.position, s.id`,
      [book.id],
    ),
    query('SELECT paragraph_id, section_id, max_seq, updated_at FROM progress WHERE user_id = $1 AND book_id = $2', [
      req.user.id,
      book.id,
    ]),
    query('SELECT * FROM goals WHERE user_id = $1 AND book_id = $2', [req.user.id, book.id]),
  ]);

  const byChapter = new Map(chapters.rows.map((c) => [c.id, { ...c, sections: [] }]));
  for (const s of sections.rows) byChapter.get(s.chapter_id)?.sections.push(s);
  const toc = [...byChapter.values()];
  const total = sections.rows.reduce((n, s) => n + s.paragraphs, 0);
  const progress = prog.rows[0] || null;
  const firstSection = toc.flatMap((c) => c.sections)[0];

  res.json({
    book: { ...book, total_paragraphs: total },
    toc,
    progress,
    resume_section_id: progress?.section_id || firstSection?.id || null,
    percent: total && progress ? Math.min(100, Math.round((progress.max_seq / total) * 100)) : 0,
    goal: goal.rows[0] ? await goalStatus({ query }, goal.rows[0], todayFrom(req)) : null,
  });
});

// One section of a book with its paragraphs and the reader's notes on them.
router.get('/:id/sections/:sectionId', async (req, res) => {
  const book = await getBook(req, intParam(req.params.id));
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  const sectionId = intParam(req.params.sectionId);

  const { rows: secRows } = await query(
    `SELECT s.id, s.title, c.id AS chapter_id, c.title AS chapter_title, c.position AS chapter_position, s.position
     FROM sections s JOIN chapters c ON c.id = s.chapter_id
     WHERE s.id = $1 AND s.book_id = $2`,
    [sectionId, book.id],
  );
  const section = secRows[0];
  if (!section) return res.status(404).json({ error: 'Section not found.' });

  const [paras, notes, order] = await Promise.all([
    query('SELECT id, seq, original, modern FROM paragraphs WHERE section_id = $1 ORDER BY position, id', [section.id]),
    query(
      `SELECT n.id, n.paragraph_id, n.body, n.created_at, n.updated_at FROM notes n
       JOIN paragraphs p ON p.id = n.paragraph_id
       WHERE n.user_id = $1 AND p.section_id = $2 ORDER BY n.created_at`,
      [req.user.id, section.id],
    ),
    query(
      `SELECT s.id FROM sections s JOIN chapters c ON c.id = s.chapter_id
       WHERE s.book_id = $1 ORDER BY c.position, c.id, s.position, s.id`,
      [book.id],
    ),
  ]);
  const ids = order.rows.map((r) => r.id);
  const idx = ids.indexOf(section.id);

  res.json({
    book: { id: book.id, title: book.title, author: book.author, year: book.year },
    section,
    paragraphs: paras.rows,
    notes: notes.rows,
    prev_section_id: idx > 0 ? ids[idx - 1] : null,
    next_section_id: idx < ids.length - 1 ? ids[idx + 1] : null,
    section_index: idx,
    section_count: ids.length,
  });
});

// Save reading position. `paragraph_id` is where to resume; optional `read_through_id` is the
// furthest paragraph the reader has finished (counts toward progress and reading goals).
router.put('/:id/progress', async (req, res) => {
  const bookId = intParam(req.params.id);
  const today = todayFrom(req);
  const atId = intParam(req.body.paragraph_id);
  const throughId = intParam(req.body.read_through_id);
  const { rows } = await query(
    'SELECT id, seq, section_id FROM paragraphs WHERE book_id = $1 AND id = ANY($2::int[])',
    [bookId, [atId, throughId].filter(Boolean)],
  );
  const at = rows.find((r) => r.id === atId);
  const through = rows.find((r) => r.id === throughId);
  if (!at) return res.status(400).json({ error: 'Unknown paragraph.' });

  const prev = await query('SELECT max_seq FROM progress WHERE user_id = $1 AND book_id = $2', [req.user.id, bookId]);
  const prevMax = prev.rows[0]?.max_seq || 0;
  const newMax = Math.max(prevMax, through?.seq || 0);

  await query(
    `INSERT INTO progress (user_id, book_id, paragraph_id, section_id, max_seq, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, book_id) DO UPDATE
     SET paragraph_id = EXCLUDED.paragraph_id, section_id = EXCLUDED.section_id,
         max_seq = GREATEST(progress.max_seq, EXCLUDED.max_seq), updated_at = now()`,
    [req.user.id, bookId, at.id, at.section_id, newMax],
  );
  await query(
    `INSERT INTO reading_days (user_id, book_id, day, start_seq, end_seq) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, book_id, day) DO UPDATE SET end_seq = GREATEST(reading_days.end_seq, EXCLUDED.end_seq)`,
    [req.user.id, bookId, today, prevMax, newMax],
  );

  const goal = await query('SELECT * FROM goals WHERE user_id = $1 AND book_id = $2', [req.user.id, bookId]);
  let status = null;
  if (goal.rows[0]) {
    status = await goalStatus({ query }, goal.rows[0], today);
    if (status.complete && !goal.rows[0].completed_at) {
      await query('UPDATE goals SET completed_at = now() WHERE id = $1', [goal.rows[0].id]);
    }
  }
  res.json({ max_seq: newMax, goal: status });
});

// Start over: clear position (keeps notes).
router.delete('/:id/progress', async (req, res) => {
  const bookId = intParam(req.params.id);
  await query('DELETE FROM progress WHERE user_id = $1 AND book_id = $2', [req.user.id, bookId]);
  await query('DELETE FROM reading_days WHERE user_id = $1 AND book_id = $2', [req.user.id, bookId]);
  await query('UPDATE goals SET start_seq = 0, completed_at = NULL WHERE user_id = $1 AND book_id = $2', [req.user.id, bookId]);
  res.json({ ok: true });
});

export default router;

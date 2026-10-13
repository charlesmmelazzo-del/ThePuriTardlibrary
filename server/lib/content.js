// Book content import / replace.
//
// Book JSON format:
// {
//   "title": "...", "author": "...", "year": 1660, "description": "...", "cover_url": "...",
//   "chapters": [
//     { "title": "Chapter 1 ...",
//       "sections": [
//         { "title": "Section title (optional)",
//           "paragraphs": [ { "original": "...", "modern": "..." } ] } ] } ]
// }
// A chapter may give "paragraphs" directly instead of "sections"; it then gets one untitled section.

const str = (v) => (v == null ? '' : String(v)).trim();
const wordCount = (s) => (s.match(/\S+/g) || []).length;

export class ContentError extends Error {}

export function normalizeMeta(input = {}) {
  const meta = {};
  if ('title' in input) meta.title = str(input.title);
  if ('author' in input) meta.author = str(input.author);
  if ('year' in input) {
    const y = input.year === '' || input.year == null ? null : parseInt(input.year, 10);
    meta.year = Number.isFinite(y) ? y : null;
  }
  if ('description' in input) meta.description = str(input.description);
  if ('cover_url' in input) meta.cover_url = str(input.cover_url);
  if ('published' in input) meta.published = Boolean(input.published);
  return meta;
}

export function normalizeChapters(chapters) {
  if (!Array.isArray(chapters)) throw new ContentError('"chapters" must be an array.');
  return chapters.map((ch, ci) => {
    if (!ch || typeof ch !== 'object') throw new ContentError(`Chapter ${ci + 1} is not an object.`);
    let sections = ch.sections;
    if (!Array.isArray(sections)) {
      if (Array.isArray(ch.paragraphs)) sections = [{ title: '', paragraphs: ch.paragraphs }];
      else throw new ContentError(`Chapter ${ci + 1} needs "sections" or "paragraphs".`);
    }
    return {
      title: str(ch.title) || `Chapter ${ci + 1}`,
      sections: sections.map((sec, si) => {
        const paras = sec?.paragraphs;
        if (!Array.isArray(paras)) {
          throw new ContentError(`Chapter ${ci + 1}, section ${si + 1} needs a "paragraphs" array.`);
        }
        return {
          title: str(sec.title),
          paragraphs: paras
            .map((p) => (typeof p === 'string' ? { original: p, modern: '' } : p || {}))
            .map((p) => ({ original: str(p.original), modern: str(p.modern) }))
            .filter((p) => p.original || p.modern),
        };
      }),
    };
  });
}

async function insertParagraphs(client, bookId, sectionId, paras, startPos = 0) {
  if (!paras.length) return;
  await client.query(
    `INSERT INTO paragraphs (section_id, book_id, position, original, modern, word_count)
     SELECT $1, $2, x.pos, x.original, x.modern, x.wc
     FROM unnest($3::int[], $4::text[], $5::text[], $6::int[]) AS x(pos, original, modern, wc)`,
    [
      sectionId,
      bookId,
      paras.map((_, i) => startPos + i),
      paras.map((p) => p.original),
      paras.map((p) => p.modern),
      paras.map((p) => wordCount(p.modern || p.original)),
    ],
  );
}

// Replaces a book's chapters/sections/paragraphs. Rows are matched by position and updated in place
// where possible so that readers' notes and bookmarks stay attached to the same paragraphs.
export async function replaceContent(client, bookId, chapters) {
  const existingCh = (
    await client.query('SELECT id FROM chapters WHERE book_id = $1 ORDER BY position, id', [bookId])
  ).rows;

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    let chapterId;
    if (existingCh[ci]) {
      chapterId = existingCh[ci].id;
      await client.query('UPDATE chapters SET title = $2, position = $3 WHERE id = $1', [chapterId, ch.title, ci]);
    } else {
      chapterId = (
        await client.query(
          'INSERT INTO chapters (book_id, position, title) VALUES ($1, $2, $3) RETURNING id',
          [bookId, ci, ch.title],
        )
      ).rows[0].id;
    }

    const existingSec = (
      await client.query('SELECT id FROM sections WHERE chapter_id = $1 ORDER BY position, id', [chapterId])
    ).rows;

    for (let si = 0; si < ch.sections.length; si++) {
      const sec = ch.sections[si];
      let sectionId;
      if (existingSec[si]) {
        sectionId = existingSec[si].id;
        await client.query('UPDATE sections SET title = $2, position = $3 WHERE id = $1', [sectionId, sec.title, si]);
      } else {
        sectionId = (
          await client.query(
            'INSERT INTO sections (chapter_id, book_id, position, title) VALUES ($1, $2, $3, $4) RETURNING id',
            [chapterId, bookId, si, sec.title],
          )
        ).rows[0].id;
      }

      const existingP = (
        await client.query(
          'SELECT id, original, modern FROM paragraphs WHERE section_id = $1 ORDER BY position, id',
          [sectionId],
        )
      ).rows;
      const n = Math.min(existingP.length, sec.paragraphs.length);
      for (let pi = 0; pi < n; pi++) {
        const p = sec.paragraphs[pi];
        const old = existingP[pi];
        if (old.original !== p.original || old.modern !== p.modern) {
          await client.query(
            'UPDATE paragraphs SET original = $2, modern = $3, word_count = $4, position = $5 WHERE id = $1',
            [old.id, p.original, p.modern, wordCount(p.modern || p.original), pi],
          );
        } else {
          await client.query('UPDATE paragraphs SET position = $2 WHERE id = $1', [old.id, pi]);
        }
      }
      if (existingP.length > n) {
        await client.query('DELETE FROM paragraphs WHERE id = ANY($1::int[])', [existingP.slice(n).map((r) => r.id)]);
      }
      await insertParagraphs(client, bookId, sectionId, sec.paragraphs.slice(n), n);
    }
    if (existingSec.length > ch.sections.length) {
      await client.query('DELETE FROM sections WHERE id = ANY($1::int[])', [
        existingSec.slice(ch.sections.length).map((r) => r.id),
      ]);
    }
  }
  if (existingCh.length > chapters.length) {
    await client.query('DELETE FROM chapters WHERE id = ANY($1::int[])', [
      existingCh.slice(chapters.length).map((r) => r.id),
    ]);
  }
  await renumber(client, bookId);
}

export async function renumber(client, bookId) {
  await client.query(
    `UPDATE paragraphs p SET seq = o.rn
     FROM (
       SELECT p.id, row_number() OVER (ORDER BY c.position, c.id, s.position, s.id, p.position, p.id) AS rn
       FROM paragraphs p
       JOIN sections s ON s.id = p.section_id
       JOIN chapters c ON c.id = s.chapter_id
       WHERE p.book_id = $1
     ) o
     WHERE p.id = o.id AND p.seq IS DISTINCT FROM o.rn`,
    [bookId],
  );
  await client.query('UPDATE books SET updated_at = now() WHERE id = $1', [bookId]);
}

// Full book as nested JSON (same shape as the import format).
export async function exportBook(db, bookId) {
  const book = (await db.query('SELECT * FROM books WHERE id = $1', [bookId])).rows[0];
  if (!book) return null;
  const chapters = (
    await db.query('SELECT id, title FROM chapters WHERE book_id = $1 ORDER BY position, id', [bookId])
  ).rows;
  const sections = (
    await db.query('SELECT id, chapter_id, title FROM sections WHERE book_id = $1 ORDER BY position, id', [bookId])
  ).rows;
  const paragraphs = (
    await db.query(
      'SELECT id, section_id, original, modern FROM paragraphs WHERE book_id = $1 ORDER BY position, id',
      [bookId],
    )
  ).rows;
  const parasBySection = new Map();
  for (const p of paragraphs) {
    if (!parasBySection.has(p.section_id)) parasBySection.set(p.section_id, []);
    parasBySection.get(p.section_id).push({ id: p.id, original: p.original, modern: p.modern });
  }
  const secsByChapter = new Map();
  for (const s of sections) {
    if (!secsByChapter.has(s.chapter_id)) secsByChapter.set(s.chapter_id, []);
    secsByChapter.get(s.chapter_id).push({ id: s.id, title: s.title, paragraphs: parasBySection.get(s.id) || [] });
  }
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    year: book.year,
    description: book.description,
    cover_url: book.cover_url,
    published: book.published,
    chapters: chapters.map((c) => ({ id: c.id, title: c.title, sections: secsByChapter.get(c.id) || [] })),
  };
}

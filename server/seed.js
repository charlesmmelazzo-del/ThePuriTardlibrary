// Books committed to the repository under content/books/*.json are added to the library
// on startup. A book is only added if no book with the same title exists yet, so edits
// made later in the admin panel are never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, tx } from './db.js';
import { normalizeChapters, normalizeMeta, replaceContent } from './lib/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'content', 'books');

export async function seedBooks() {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const meta = normalizeMeta(data);
      if (!meta.title) continue;
      const exists = await query('SELECT 1 FROM books WHERE lower(title) = lower($1)', [meta.title]);
      if (exists.rowCount) continue;
      const chapters = normalizeChapters(data.chapters || []);
      await tx(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO books (title, author, year, description, cover_url, published)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [meta.title, meta.author || '', meta.year ?? null, meta.description || '', meta.cover_url || '', meta.published ?? true],
        );
        await replaceContent(client, rows[0].id, chapters);
      });
      console.log(`Added "${meta.title}" to the library from ${file}`);
    } catch (err) {
      console.error(`Could not import ${file}: ${err.message}`);
    }
  }
}

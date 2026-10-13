#!/usr/bin/env node
// Upload a book JSON file to the library through the admin API.
//
//   APP_URL=https://your-app.up.railway.app ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
//     npm run import-book -- path/to/book.json [--replace <bookId>]
//
// Without --replace a new book is created. With --replace the existing book's details and
// contents are updated in place (readers' notes and progress are kept).
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const replaceIdx = args.indexOf('--replace');
const replaceId = replaceIdx >= 0 ? args[replaceIdx + 1] : null;
const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!file) {
  console.error('Usage: npm run import-book -- book.json [--replace <bookId>]');
  process.exit(1);
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and APP_URL for a deployed site).');
  process.exit(1);
}

async function call(path, options = {}) {
  const res = await fetch(`${base}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${data.error || res.statusText}`);
  return data;
}

const book = JSON.parse(fs.readFileSync(file, 'utf8'));
const { token } = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
const auth = { Authorization: `Bearer ${token}` };

const result = replaceId
  ? await call(`/admin/books/${replaceId}`, { method: 'PUT', headers: auth, body: JSON.stringify(book) })
  : await call('/admin/books', { method: 'POST', headers: auth, body: JSON.stringify(book) });

const b = result.book;
const paragraphs = b.chapters.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.paragraphs.length, 0), 0);
console.log(`${replaceId ? 'Updated' : 'Created'} "${b.title}" (id ${b.id}): ${b.chapters.length} chapters, ${paragraphs} paragraphs.`);
console.log(`Cover: ${b.cover_url || '(none found; add one in the admin panel)'}`);
console.log(`${base}/books/${b.id}`);

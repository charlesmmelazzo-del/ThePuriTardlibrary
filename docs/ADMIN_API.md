# Admin API (for scripts and AI assistants)

Everything in the admin panel can also be done over HTTP with the admin email and password.

## 1. Log in

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "ADMIN_EMAIL", "password": "ADMIN_PASSWORD" }
```

The response has a `token`. Send it with every admin request:

```
Authorization: Bearer <token>
```

Tokens last 60 days, and changing the password invalidates them.

## 2. Book format

```json
{
  "title": "The Rare Jewel of Christian Contentment",
  "author": "Jeremiah Burroughs",
  "year": 1648,
  "description": "Short blurb shown on the book page.",
  "cover_url": "",
  "published": true,
  "chapters": [
    {
      "title": "Chapter 1: The Description of Contentment",
      "sections": [
        {
          "title": "Contentment is a sweet, inward heart-thing",
          "paragraphs": [
            { "original": "Text as first printed…", "modern": "The same paragraph in modern English…" }
          ]
        }
      ]
    }
  ]
}
```

- **Chapters** contain **sections**, and sections contain **paragraphs**. Each paragraph is a pair: `original` and `modern`. Readers flip each paragraph like a card.
- A chapter with no subdivisions can give `"paragraphs": [...]` directly instead of `"sections"`. It then gets one untitled section.
- Section titles are optional. Keep sections a comfortable length to read at a sitting (roughly 5–40 paragraphs). A reader opens one section at a time, and progress, goals and "next section" all work in sections.
- Leave `cover_url` empty and artwork is looked up automatically (Open Library, Google Books, then Wikipedia). Send `"auto_cover": false` to skip the lookup.
- `examples/sample-book.json` is a complete small example.

## 3. Endpoints

| Method & path | What it does |
| --- | --- |
| `GET /api/admin/books` | List every book with counts |
| `POST /api/admin/books` | Create a book. Body: the book format above |
| `GET /api/admin/books/:id` | Full book as JSON (same format, plus ids) |
| `PUT /api/admin/books/:id` | Update details. Include `chapters` to replace the contents too |
| `PUT /api/admin/books/:id/content` | Replace only the contents: `{ "chapters": [...] }` |
| `POST /api/admin/books/:id/chapters` | Append chapters to the end: `{ "chapters": [...] }` (useful for importing a long book in parts) |
| `PATCH /api/admin/paragraphs/:id` | Fix one paragraph: `{ "original"?: "...", "modern"?: "..." }` |
| `DELETE /api/admin/books/:id` | Delete a book, including every reader's notes, progress and goals for it |
| `GET /api/admin/covers?title=&author=` | Search for cover artwork online |
| `GET /api/admin/users?q=` | List and search users |
| `POST /api/admin/users` | Create a user: `{ email, password, name?, is_admin? }` |
| `PATCH /api/admin/users/:id` | Edit a user: `{ email?, name?, is_admin?, password? }`. Setting a password signs them out |
| `DELETE /api/admin/users/:id` | Delete a user |
| `GET /api/admin/stats` | Counts for the overview page |

When contents are replaced, rows are matched **by position**: chapter 3, section 2, paragraph 5 stays the same row. Readers' notes and bookmarks therefore survive text corrections. Inserting or removing paragraphs shifts the positions after that point.

## 4. One-step import from the command line

```bash
APP_URL=https://your-app.up.railway.app \
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' \
npm run import-book -- path/to/book.json

# update an existing book (id 3) in place
npm run import-book -- path/to/book.json --replace 3
```

## 5. Turning a side-by-side PDF into the book format

1. Extract the text from each page, keeping the original column and the modern column separate.
2. Pair the paragraphs up in order: original paragraph *n* goes with modern paragraph *n*.
3. Use the book's own chapter headings as `chapters`. Use its sub-headings (or natural breaks) as `sections`.
4. Remove page headers, footers and page numbers, and re-join paragraphs that were split across pages.
5. Upload with `POST /api/admin/books`. Check a few sections in the reader, and fix any stray paragraphs with `PATCH /api/admin/paragraphs/:id` or in the admin editor.

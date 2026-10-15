# The PuriTard Library

*Rich Historical Texts for Modern Tards*

A web app for reading Puritan and Reformed classics paragraph by paragraph. Each paragraph is a card: modern English on one side, the original text on the other. Swipe sideways to flip it.

## Features

- **Flip cards.** Swipe a paragraph sideways (or tap *Original*/*Modern*) to turn it over. A switch at the top flips every card at once, and readers choose which side faces up by default.
- **Picks up where you left off.** Opening a book returns you to the exact paragraph you were reading.
- **Bookmarks.** Tap *Bookmark* under any paragraph and the book opens there next time, even if you read on or jump around in between. All bookmarks are listed in the reader (*Contents → Bookmarks*) and on the book's page.
- **Home-screen app.** Add it to an iPhone or Android home screen and it opens full-screen with its own icon (`client/public/icons/`, `manifest.webmanifest`).
- **Notes** on any paragraph, collected on the *Notes* page and searchable.
- **Sharing.** Send an excerpt (modern, original or both, with citation) by the device share sheet, text message or email, or copy it.
- **Reading goals.** Pick a book and a finish date (1 week to 1 year, or any date). Each day the app says how much to read and how far that takes you. Miss some days and it works out the new daily amount needed to catch up.
- **Library** with cover artwork found online, sorting by title, author, year or recently read, and grouping by author.
- **Global search** across the original and modern text of every book, book titles and authors, and your own notes.
- **Light and dark mode**, saved to each account. Adjustable text size.
- **Accounts.** Sign up with an email and password. The login page shows the support email for anyone who gets stuck.
- **Glossary mode.** Switch it on in the reader, then tap any word (or select a phrase) for a pop-up definition. Older and Puritan senses come from the app's own glossary (editable under *Admin → Glossary*), with a regular dictionary definition from Wiktionary underneath.
- **Shelves.** *All books* is the whole library. Every reader has *My Shelf* (tap the bookmark on any cover) and can create more shelves, like playlists.
- **Reading groups.** A host starts a group for a book and adds people by email. People without an account get an invitation email whose link leads to sign-up with their email filled in, and they join the group automatically. The app can set the pace from a finish date, or hosts can assign readings by hand. Latecomers get a catch-up plan. Members see everyone's progress (including who has read today), share group notes on paragraphs (private notes stay private), and talk on the group's message board. Hosts can make co-hosts, who can also edit the group.
- **Admin panel** (`/admin`): add, edit, import, export, hide or delete books; edit chapters, sections and paragraphs; find cover art; manage users (edit, reset passwords, grant admin, delete).
- **Admin API** so scripts or AI assistants can add books with the admin credentials. See [docs/ADMIN_API.md](docs/ADMIN_API.md).

## Deploying on Railway

1. Push this repository to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** and pick this repo.
3. In the same project: **New → Database → PostgreSQL**.
4. In the web service's **Variables**, add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the database) |
   | `JWT_SECRET` | a long random string |
   | `ADMIN_EMAIL` | your admin login email |
   | `ADMIN_PASSWORD` | your admin password |
   | `SUPPORT_EMAIL` | email shown for login help (defaults to mike@cgcocktails.com) |
   | `APP_NAME` / `APP_TAGLINE` | optional; default to "The PuriTard Library" and "Rich Historical Texts for Modern Tards" |
   | `NODE_ENV` | `production` |

5. Under **Settings → Networking**, click **Generate Domain**.

On every start the server creates the database tables if needed and makes sure the admin account exists with the password in `ADMIN_PASSWORD`. To reset the admin password, change the variable and redeploy.

## Adding books

- **Admin panel:** *Admin → Books → Add a book*. Fill in the details, then *Import JSON* or type chapters and paragraphs in the editor.
- **Command line or AI assistant:** see [docs/ADMIN_API.md](docs/ADMIN_API.md). Example:

  ```bash
  APP_URL=https://your-app.up.railway.app ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run import-book -- examples/sample-book.json
  ```

### From a side-by-side PDF

To have ChatGPT produce a PDF in the right format, give it the prompt in [docs/CHATGPT_PDF_PROMPT.md](docs/CHATGPT_PDF_PROMPT.md).

Books in `content/books/*.json` are added to the library automatically the next time the server starts (only if no book with that title exists yet, so later edits in the admin panel are kept). A two-column "original | modern English" PDF (or several, for a long book) can be converted with the command below. Title, author, year and description come from the PDF's BOOK INFO page, or from `--title`, `--author`, `--year` and `--description`.

```bash
pip install pdfplumber
python3 scripts/pdf-to-book.py "Book - Part 1 of 2.pdf" "Book - Part 2 of 2.pdf" content/books/book.json \
  --cover /covers/book.webp
```

Cover images go in `client/public/covers/`.

## Running locally

Requires Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env          # then edit it
export $(grep -v '^#' .env | xargs)
npm run dev                   # API on :3000, web app on http://localhost:5173
```

For a production build: `npm run build && npm start`, then open http://localhost:3000.

## Project layout

```
server/            Express API
  schema.sql       database tables (applied automatically)
  routes/          auth, books/progress, notes/goals/search, admin
  lib/             content import, goal math, cover lookup
client/            React app (Vite)
  src/pages/       Library, Book, Reader, Notes, Goals, Search, Settings, admin/
scripts/           import-book.js
docs/              ADMIN_API.md
examples/          sample-book.json
```

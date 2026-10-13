-- Schema is idempotent: it runs on every server start.

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
  theme          TEXT NOT NULL DEFAULT 'light',
  default_side   TEXT NOT NULL DEFAULT 'modern',
  font_size      INTEGER NOT NULL DEFAULT 18,
  token_version  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS books (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  author       TEXT NOT NULL DEFAULT '',
  year         INTEGER,
  description  TEXT NOT NULL DEFAULT '',
  cover_url    TEXT NOT NULL DEFAULT '',
  published    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
  id        SERIAL PRIMARY KEY,
  book_id   INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  title     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS chapters_book_idx ON chapters(book_id, position);

CREATE TABLE IF NOT EXISTS sections (
  id          SERIAL PRIMARY KEY,
  chapter_id  INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sections_chapter_idx ON sections(chapter_id, position);

CREATE TABLE IF NOT EXISTS paragraphs (
  id          SERIAL PRIMARY KEY,
  section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  -- 1-based reading order across the whole book; recomputed whenever content changes
  seq         INTEGER NOT NULL DEFAULT 0,
  original    TEXT NOT NULL DEFAULT '',
  modern      TEXT NOT NULL DEFAULT '',
  word_count  INTEGER NOT NULL DEFAULT 0,
  tsv         TSVECTOR GENERATED ALWAYS AS (
                to_tsvector('english', coalesce(original, '') || ' ' || coalesce(modern, ''))
              ) STORED
);
CREATE INDEX IF NOT EXISTS paragraphs_section_idx ON paragraphs(section_id, position);
CREATE INDEX IF NOT EXISTS paragraphs_book_seq_idx ON paragraphs(book_id, seq);
CREATE INDEX IF NOT EXISTS paragraphs_tsv_idx ON paragraphs USING GIN (tsv);

CREATE TABLE IF NOT EXISTS progress (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  paragraph_id  INTEGER REFERENCES paragraphs(id) ON DELETE SET NULL,
  section_id    INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  -- furthest point reached (paragraph seq); never goes backwards
  max_seq       INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

-- One row per user/book/local day, recording where the reader started and ended that day.
CREATE TABLE IF NOT EXISTS reading_days (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  start_seq  INTEGER NOT NULL,
  end_seq    INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id, day)
);

CREATE TABLE IF NOT EXISTS notes (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  paragraph_id  INTEGER NOT NULL REFERENCES paragraphs(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id, book_id);
CREATE INDEX IF NOT EXISTS notes_paragraph_idx ON notes(paragraph_id);

CREATE TABLE IF NOT EXISTS goals (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  target_date  DATE NOT NULL,
  start_seq    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, book_id)
);

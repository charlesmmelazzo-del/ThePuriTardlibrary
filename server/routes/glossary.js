// Word definitions for glossary mode, plus admin management of the curated glossary.
import { Router } from 'express';
import { query } from '../db.js';
import { requireAdmin, requireUser } from '../auth.js';
import { GLOSSARY_SEED, GLOSSARY_SEED_VERSION } from '../lib/glossarySeed.js';

const router = Router();
const CACHE_DAYS = 60;

export async function seedGlossary() {
  const { rows } = await query("SELECT value FROM app_meta WHERE key = 'glossary_seed_version'");
  if (Number(rows[0]?.value || 0) >= GLOSSARY_SEED_VERSION) return;
  const terms = Object.keys(GLOSSARY_SEED);
  await query(
    `INSERT INTO glossary (term, definition)
     SELECT * FROM unnest($1::text[], $2::text[]) ON CONFLICT (term) DO NOTHING`,
    [terms, terms.map((t) => GLOSSARY_SEED[t])],
  );
  await query(
    `INSERT INTO app_meta (key, value) VALUES ('glossary_seed_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(GLOSSARY_SEED_VERSION)],
  );
}

const clean = (s) =>
  String(s || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    .replace(/'s$/i, '')
    .toLowerCase()
    .slice(0, 60);

// Plausible base forms for older inflections (hath → ha, believeth → believe, mortified → mortify).
function variants(w) {
  const out = new Set([w]);
  const add = (x) => x && x.length > 1 && out.add(x);
  if (w.endsWith('eth')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
  }
  if (w.endsWith('est')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
    add(w.slice(0, -2));
  }
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
  }
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('es')) add(w.slice(0, -2));
  return [...out];
}

const stripHtml = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PuriTardLibrary/1.0 (glossary lookup)', Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fromWiktionary(word) {
  const data = await fetchJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
  const entries = (data?.en || [])
    .map((e) => ({
      partOfSpeech: e.partOfSpeech,
      definitions: (e.definitions || [])
        .map((d) => stripHtml(d.definition))
        .filter(Boolean)
        .slice(0, 3),
    }))
    .filter((e) => e.definitions.length)
    .slice(0, 3);
  return entries.length ? { source: 'Wiktionary', url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`, entries } : null;
}

async function fromFreeDictionary(word) {
  const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!Array.isArray(data)) return null;
  const entries = data
    .flatMap((d) => d.meanings || [])
    .map((m) => ({ partOfSpeech: m.partOfSpeech, definitions: (m.definitions || []).map((d) => d.definition).slice(0, 3) }))
    .filter((e) => e.definitions.length)
    .slice(0, 3);
  return entries.length ? { source: 'Free Dictionary', url: null, entries } : null;
}

async function dictionaryLookup(word) {
  const cached = await query(
    `SELECT data FROM word_cache WHERE word = $1 AND fetched_at > now() - interval '${CACHE_DAYS} days'`,
    [word],
  );
  if (cached.rows[0]) return cached.rows[0].data.result;
  let result = null;
  let failed = false;
  for (const source of [fromWiktionary, fromFreeDictionary]) {
    try {
      result = await source(word);
      if (result) break;
    } catch (err) {
      failed = true;
      console.warn(`Definition lookup failed for "${word}":`, err.message);
    }
  }
  // Don't cache a miss caused by a network failure.
  if (result || !failed) {
    await query(
      `INSERT INTO word_cache (word, data, fetched_at) VALUES ($1, $2, now())
       ON CONFLICT (word) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`,
      [word, { result }],
    );
  }
  return result;
}

// GET /api/define?word=hath
router.get('/define', requireUser, async (req, res) => {
  const word = clean(req.query.word);
  if (!word) return res.status(400).json({ error: 'Choose a word to look up.' });

  const forms = word.includes(' ') ? [word] : variants(word);
  const curated = await query('SELECT term, definition FROM glossary WHERE term = ANY($1::text[])', [forms]);
  const best = forms.map((f) => curated.rows.find((r) => r.term === f)).find(Boolean);

  let dictionary = null;
  for (const form of forms.slice(0, 4)) {
    dictionary = await dictionaryLookup(form);
    if (dictionary) {
      dictionary.lookedUp = form;
      break;
    }
  }
  res.json({ word, glossary: best ? { term: best.term, definition: best.definition } : null, dictionary });
});

/* ---------- Admin: curated glossary ---------- */

router.get('/admin/glossary', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const { rows } = await query(
    `SELECT id, term, definition, updated_at FROM glossary
     WHERE $1 = '' OR term LIKE '%' || $1 || '%' OR lower(definition) LIKE '%' || $1 || '%'
     ORDER BY term`,
    [q],
  );
  res.json({ terms: rows });
});

router.post('/admin/glossary', requireAdmin, async (req, res) => {
  const term = clean(req.body.term);
  const definition = String(req.body.definition || '').trim();
  if (!term || !definition) return res.status(400).json({ error: 'Enter a word and its definition.' });
  const { rows } = await query(
    `INSERT INTO glossary (term, definition) VALUES ($1, $2)
     ON CONFLICT (term) DO UPDATE SET definition = EXCLUDED.definition, updated_at = now()
     RETURNING id, term, definition, updated_at`,
    [term, definition],
  );
  res.status(201).json({ term: rows[0] });
});

router.patch('/admin/glossary/:id', requireAdmin, async (req, res) => {
  const term = clean(req.body.term);
  const definition = String(req.body.definition || '').trim();
  if (!term || !definition) return res.status(400).json({ error: 'Enter a word and its definition.' });
  try {
    const { rows } = await query(
      'UPDATE glossary SET term = $2, definition = $3, updated_at = now() WHERE id = $1 RETURNING id, term, definition, updated_at',
      [Number.parseInt(req.params.id, 10), term, definition],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json({ term: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That word is already in the glossary.' });
    throw err;
  }
});

router.delete('/admin/glossary/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM glossary WHERE id = $1', [Number.parseInt(req.params.id, 10)]);
  res.json({ ok: true });
});

export default router;

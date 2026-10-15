import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { migrate, query } from './db.js';
import { ensureAdmin, loadUser } from './auth.js';
import { seedBooks } from './seed.js';
import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import meRoutes from './routes/me.js';
import adminRoutes from './routes/admin.js';
import groupRoutes from './routes/groups.js';
import shelfRoutes from './routes/shelves.js';
import glossaryRoutes, { seedGlossary } from './routes/glossary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'connect-src': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(loadUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) =>
  res.json({
    appName: process.env.APP_NAME || 'The PuriTard Library',
    tagline: process.env.APP_TAGLINE ?? 'Rich Historical Texts for Modern Tards',
    supportEmail: process.env.SUPPORT_EMAIL || 'mike@cgcocktails.com',
  }),
);
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/shelves', shelfRoutes);
app.use('/api', glossaryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', groupRoutes);
app.use('/api', meRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built web app.
const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));

  // Invitation links get a rich preview (book cover + group name) when shared by text or chat.
  app.get('/invite/:token', async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT g.name, b.title, b.author, b.cover_url, u.name AS host_name, u.email AS host_email
         FROM group_invites i JOIN reading_groups g ON g.id = i.group_id JOIN books b ON b.id = g.book_id
         LEFT JOIN users u ON u.id = i.invited_by WHERE i.token = $1`,
        [req.params.token],
      );
      const inv = rows[0];
      let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
      if (inv) {
        const origin = `${req.protocol}://${req.get('host')}`;
        const host = inv.host_name || String(inv.host_email || '').split('@')[0];
        const title = `${host} invited you to read ${inv.title} together`;
        const desc = `Join the “${inv.name}” reading group on ${process.env.APP_NAME || 'The PuriTard Library'}.`;
        const image = inv.cover_url ? new URL(inv.cover_url, origin).href : `${origin}/icons/icon-512.png`;
        const meta = [
          ['og:title', title],
          ['og:description', desc],
          ['og:image', image],
          ['og:type', 'website'],
          ['twitter:card', 'summary_large_image'],
        ]
          .map(([k, v]) => `<meta property="${k}" content="${escapeHtml(v)}" />`)
          .join('\n    ');
        html = html.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>\n    ${meta}`);
      }
      res.type('html').send(html);
    } catch (err) {
      next(err);
    }
  });

  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

const port = Number(process.env.PORT) || 3000;
await migrate();
await ensureAdmin();
await seedBooks();
await seedGlossary();
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));

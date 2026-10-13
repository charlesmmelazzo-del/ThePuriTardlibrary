import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { migrate } from './db.js';
import { ensureAdmin, loadUser } from './auth.js';
import authRoutes from './routes/auth.js';
import bookRoutes from './routes/books.js';
import meRoutes from './routes/me.js';
import adminRoutes from './routes/admin.js';

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
    appName: process.env.APP_NAME || 'The Puritan Library',
    supportEmail: process.env.SUPPORT_EMAIL || 'mike@cgcocktails.com',
  }),
);
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', meRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built web app.
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
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
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));

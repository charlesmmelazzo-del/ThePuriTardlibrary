import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import {
  COOKIE,
  checkPassword,
  hashPassword,
  normalizeEmail,
  publicUser,
  requireUser,
  setAuthCookie,
  signToken,
  validateCredentials,
} from '../auth.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

router.post('/signup', limiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const name = String(req.body.name || '').trim().slice(0, 100);
  const problem = validateCredentials(email, password);
  if (problem) return res.status(400).json({ error: problem });

  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) return res.status(409).json({ error: 'An account with that email already exists. Try logging in.' });

  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, last_login_at) VALUES ($1, $2, $3, now()) RETURNING *`,
    [email, await hashPassword(password), name],
  );
  const token = signToken(rows[0]);
  setAuthCookie(res, token);
  res.status(201).json({ user: publicUser(rows[0]), token });
});

router.post('/login', limiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await checkPassword(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: publicUser(user), token });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.patch('/me', requireUser, async (req, res) => {
  const updates = [];
  const params = [req.user.id];
  const set = (col, val) => {
    params.push(val);
    updates.push(`${col} = $${params.length}`);
  };
  const b = req.body;
  if (typeof b.name === 'string') set('name', b.name.trim().slice(0, 100));
  if (b.theme === 'light' || b.theme === 'dark') set('theme', b.theme);
  if (b.default_side === 'modern' || b.default_side === 'original') set('default_side', b.default_side);
  if (Number.isInteger(b.font_size) && b.font_size >= 14 && b.font_size <= 28) set('font_size', b.font_size);
  if (!updates.length) return res.json({ user: publicUser(req.user) });
  const { rows } = await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1 RETURNING *`, params);
  res.json({ user: publicUser(rows[0]) });
});

router.post('/password', requireUser, async (req, res) => {
  const { current_password: current, new_password: next } = req.body;
  if (!(await checkPassword(String(current || ''), req.user.password_hash))) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  if (!next || String(next).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const { rows } = await query(
    'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING *',
    [req.user.id, await hashPassword(next)],
  );
  const token = signToken(rows[0]);
  setAuthCookie(res, token);
  res.json({ ok: true, token });
});

export default router;

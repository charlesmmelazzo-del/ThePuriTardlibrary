import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_DAYS = 60;
export const COOKIE = 'pl_token';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: JWT_SECRET is not set. Set it to a long random string.');
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  if (!password || String(password).length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, v: user.token_version }, SECRET, { expiresIn: `${TOKEN_DAYS}d` });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TOKEN_DAYS * 24 * 3600 * 1000,
  });
}

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    is_admin: u.is_admin,
    theme: u.theme,
    default_side: u.default_side,
    font_size: u.font_size,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

// Accepts the session cookie (browser) or an "Authorization: Bearer <token>" header (scripts / AI agents).
export async function loadUser(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, SECRET);
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const user = rows[0];
    if (user && user.token_version === payload.v) req.user = user;
  } catch {
    // invalid or expired token: treat as logged out
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admins only.' });
  next();
}

export async function ensureAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set; no admin account was created.');
    return;
  }
  const hash = await hashPassword(password);
  const { rows } = await query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
  if (rows[0]) {
    // Keep the admin password in sync with the environment so it can always be recovered.
    const same = await checkPassword(password, rows[0].password_hash);
    await query(
      `UPDATE users SET is_admin = TRUE${same ? '' : ', password_hash = $2, token_version = token_version + 1'} WHERE id = $1`,
      same ? [rows[0].id] : [rows[0].id, hash],
    );
  } else {
    await query(
      `INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, 'Admin', TRUE)`,
      [email, hash],
    );
  }
  console.log(`Admin account ready: ${email}`);
}

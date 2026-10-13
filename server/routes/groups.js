// Reading groups: members and roles, invitations, pacing/assignments, message board and group notes.
import crypto from 'node:crypto';
import { Router } from 'express';
import { query, tx } from '../db.js';
import { normalizeEmail, requireUser } from '../auth.js';
import { daysBetween, isDate, todayFrom } from '../lib/goals.js';
import { bookTotals, groupAssignments, groupSchedule, memberPace } from '../lib/groupPace.js';

const router = Router();

const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
export const displayName = (u) => (u.name && u.name.trim()) || String(u.email || '').split('@')[0] || 'Reader';
const isManager = (role) => role === 'host' || role === 'cohost';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadGroup(groupId, userId) {
  const { rows } = await query(
    `SELECT g.*, m.role AS my_role, b.title AS book_title, b.author AS book_author, b.cover_url, b.year AS book_year
     FROM reading_groups g
     JOIN books b ON b.id = g.book_id
     LEFT JOIN group_members m ON m.group_id = g.id AND m.user_id = $2
     WHERE g.id = $1`,
    [groupId, userId],
  );
  return rows[0] || null;
}

// Loads the group into req.group; 404s unless the user is a member (or one of `roles`).
const member = (roles = null) => async (req, res, next) => {
  const group = await loadGroup(intParam(req.params.id), req.user.id);
  if (!group || !group.my_role) return res.status(404).json({ error: 'Group not found.' });
  if (roles && !roles.includes(group.my_role)) {
    return res.status(403).json({ error: 'Only the group’s host or co-hosts can do that.' });
  }
  req.group = group;
  next();
};

async function addMember(groupId, userId, role = 'member') {
  await query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (group_id, user_id) DO NOTHING`,
    [groupId, userId, role],
  );
}

/** Adds the user to every group they have a pending invitation for (matched by email or by token). */
export async function acceptInvites(user, token = null) {
  const { rows } = await query(
    `SELECT id, group_id FROM group_invites
     WHERE accepted_at IS NULL AND (lower(email) = lower($1) OR token = $2)`,
    [user.email, token || ''],
  );
  for (const inv of rows) {
    await addMember(inv.group_id, user.id);
    await query('UPDATE group_invites SET accepted_at = now(), accepted_by = $2 WHERE id = $1', [inv.id, user.id]);
  }
  return rows.map((r) => r.group_id);
}

async function memberRows(group, today, includeEmail) {
  const total = await bookTotals(group.book_id);
  const assignments = await groupAssignments(group.id);
  const schedule = await groupSchedule(group, total, assignments, today);
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, m.role, m.joined_at,
            coalesce(p.max_seq, 0) AS max_seq, p.updated_at AS last_read_at,
            coalesce(rd.end_seq - rd.start_seq, 0) AS read_today
     FROM group_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN progress p ON p.user_id = u.id AND p.book_id = $2
     LEFT JOIN reading_days rd ON rd.user_id = u.id AND rd.book_id = $2 AND rd.day = $3
     WHERE m.group_id = $1
     ORDER BY CASE m.role WHEN 'host' THEN 0 WHEN 'cohost' THEN 1 ELSE 2 END, m.joined_at`,
    [group.id, group.book_id, today],
  );
  const members = rows.map((r) => ({
    id: r.id,
    name: displayName(r),
    ...(includeEmail ? { email: r.email } : {}),
    role: r.role,
    joined_at: r.joined_at,
    last_read_at: r.last_read_at,
    read_today: r.read_today,
    pace: memberPace(group, total, schedule, assignments, r.max_seq, today),
  }));
  return { total, assignments, schedule, members };
}

function publicGroup(g) {
  return {
    id: g.id,
    name: g.name,
    book_id: g.book_id,
    book_title: g.book_title,
    book_author: g.book_author,
    book_year: g.book_year,
    cover_url: g.cover_url,
    pace_mode: g.pace_mode,
    start_date: g.start_date,
    target_date: g.target_date,
    host_id: g.host_id,
    my_role: g.my_role,
    created_at: g.created_at,
  };
}

/* ---------------- Public invitation lookup ---------------- */

// GET /api/invites/:token — no login needed (shown on the invitation page).
router.get('/invites/:token', async (req, res) => {
  const { rows } = await query(
    `SELECT i.email, i.accepted_at, g.id AS group_id, g.name, g.target_date, g.pace_mode,
            b.title AS book_title, b.author AS book_author, b.cover_url, b.description AS book_description,
            u.name AS host_name, u.email AS host_email,
            (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.id) AS member_count
     FROM group_invites i
     JOIN reading_groups g ON g.id = i.group_id
     JOIN books b ON b.id = g.book_id
     LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.token = $1`,
    [String(req.params.token)],
  );
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'This invitation link is not valid. Ask the group’s host to send a new one.' });
  const userExists = await query('SELECT 1 FROM users WHERE email = $1', [normalizeEmail(inv.email)]);
  const isMember = req.user
    ? (await query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [inv.group_id, req.user.id])).rowCount > 0
    : false;
  res.json({
    invite: {
      email: inv.email,
      accepted: Boolean(inv.accepted_at),
      group_id: inv.group_id,
      group_name: inv.name,
      target_date: inv.pace_mode === 'auto' ? inv.target_date : null,
      book_title: inv.book_title,
      book_author: inv.book_author,
      book_description: inv.book_description,
      cover_url: inv.cover_url,
      host_name: inv.host_name || (inv.host_email || '').split('@')[0],
      member_count: inv.member_count,
      has_account: userExists.rowCount > 0,
      is_member: isMember,
    },
  });
});

router.post('/invites/:token/accept', requireUser, async (req, res) => {
  const { rows } = await query('SELECT group_id, accepted_at, accepted_by FROM group_invites WHERE token = $1', [String(req.params.token)]);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'This invitation link is not valid.' });
  if (inv.accepted_at && inv.accepted_by !== req.user.id) {
    const already = await query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [inv.group_id, req.user.id]);
    if (!already.rowCount) return res.status(410).json({ error: 'This invitation has already been used. Ask the host for a new one.' });
  }
  await acceptInvites(req.user, String(req.params.token));
  res.json({ group_id: inv.group_id });
});

/* ---------------- Groups ---------------- */

router.use('/groups', requireUser);

// My groups (optionally for one book), each with my pace.
router.get('/groups', async (req, res) => {
  const today = todayFrom(req);
  const bookId = intParam(req.query.book_id);
  const { rows } = await query(
    `SELECT g.*, m.role AS my_role, b.title AS book_title, b.author AS book_author, b.cover_url, b.year AS book_year,
            (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS member_count,
            (SELECT count(*)::int FROM group_messages gm WHERE gm.group_id = g.id) AS message_count,
            coalesce(p.max_seq, 0) AS my_max_seq
     FROM group_members m
     JOIN reading_groups g ON g.id = m.group_id
     JOIN books b ON b.id = g.book_id
     LEFT JOIN progress p ON p.user_id = m.user_id AND p.book_id = g.book_id
     WHERE m.user_id = $1 AND ($2::int IS NULL OR g.book_id = $2)
     ORDER BY g.created_at DESC`,
    [req.user.id, bookId],
  );
  const groups = await Promise.all(
    rows.map(async (g) => {
      const total = await bookTotals(g.book_id);
      const assignments = await groupAssignments(g.id);
      const schedule = await groupSchedule(g, total, assignments, today);
      return {
        ...publicGroup(g),
        member_count: g.member_count,
        message_count: g.message_count,
        schedule,
        my_pace: memberPace(g, total, schedule, assignments, g.my_max_seq, today),
      };
    }),
  );
  res.json({ groups });
});

// Create a group. Body: { name, book_id, pace_mode, target_date, emails: [], today }
router.post('/groups', async (req, res) => {
  const today = todayFrom(req);
  const name = String(req.body.name || '').trim().slice(0, 100);
  const bookId = intParam(req.body.book_id);
  const paceMode = req.body.pace_mode === 'manual' ? 'manual' : 'auto';
  const target = req.body.target_date || null;
  if (!name) return res.status(400).json({ error: 'Give your group a name.' });
  const book = await query('SELECT id FROM books WHERE id = $1', [bookId]);
  if (!book.rows[0]) return res.status(400).json({ error: 'Choose a book for the group.' });
  if (paceMode === 'auto') {
    if (!isDate(target)) return res.status(400).json({ error: 'Choose when the group should finish the book.' });
    if (daysBetween(today, target) < 0) return res.status(400).json({ error: 'The finish date must be today or later.' });
  }

  const groupId = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO reading_groups (book_id, name, host_id, pace_mode, start_date, target_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [bookId, name, req.user.id, paceMode, today, paceMode === 'auto' ? target : isDate(target) ? target : null],
    );
    await client.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'host')`, [rows[0].id, req.user.id]);
    return rows[0].id;
  });

  const emails = [...new Set((Array.isArray(req.body.emails) ? req.body.emails : []).map(normalizeEmail).filter((e) => EMAIL_RE.test(e)))];
  const added = [];
  const unmatched = [];
  for (const email of emails) {
    if (email === req.user.email) continue;
    const u = await query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    if (u.rows[0]) {
      await addMember(groupId, u.rows[0].id);
      added.push(displayName(u.rows[0]));
    } else {
      unmatched.push(email);
    }
  }
  res.status(201).json({ group_id: groupId, added, unmatched });
});

// Full group view: details, schedule, everyone's progress, assignments, invites (for hosts).
router.get('/groups/:id', member(), async (req, res) => {
  const today = todayFrom(req);
  const g = req.group;
  const manager = isManager(g.my_role);
  const { total, assignments, schedule, members } = await memberRows(g, today, manager);
  const me = members.find((m) => m.id === req.user.id);

  const [toc, invites, progress] = await Promise.all([
    query(
      `SELECT s.id, s.title, c.title AS chapter_title, (SELECT max(p.seq) FROM paragraphs p WHERE p.section_id = s.id) AS last_seq
       FROM sections s JOIN chapters c ON c.id = s.chapter_id
       WHERE s.book_id = $1 ORDER BY c.position, c.id, s.position, s.id`,
      [g.book_id],
    ),
    manager
      ? query('SELECT id, email, token, created_at FROM group_invites WHERE group_id = $1 AND accepted_at IS NULL ORDER BY created_at DESC', [g.id])
      : { rows: [] },
    query('SELECT section_id FROM progress WHERE user_id = $1 AND book_id = $2', [req.user.id, g.book_id]),
  ]);
  const firstSection = toc.rows[0]?.id || null;

  res.json({
    group: publicGroup(g),
    total_paragraphs: total,
    schedule,
    my_pace: me?.pace || null,
    members,
    assignments,
    sections: toc.rows,
    invites: invites.rows,
    resume_section_id: progress.rows[0]?.section_id || firstSection,
  });
});

// Edit the group (host or co-host). Body: { name?, pace_mode?, target_date? }
router.patch('/groups/:id', member(['host', 'cohost']), async (req, res) => {
  const g = req.group;
  const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 100) : g.name;
  const paceMode = req.body.pace_mode === 'manual' || req.body.pace_mode === 'auto' ? req.body.pace_mode : g.pace_mode;
  const target = req.body.target_date !== undefined ? req.body.target_date || null : g.target_date;
  if (!name) return res.status(400).json({ error: 'Give your group a name.' });
  if (paceMode === 'auto' && !isDate(target)) return res.status(400).json({ error: 'Choose when the group should finish the book.' });
  await query('UPDATE reading_groups SET name = $2, pace_mode = $3, target_date = $4 WHERE id = $1', [
    g.id,
    name,
    paceMode,
    isDate(target) ? target : null,
  ]);
  res.json({ ok: true });
});

router.delete('/groups/:id', member(['host']), async (req, res) => {
  await query('DELETE FROM reading_groups WHERE id = $1', [req.group.id]);
  res.json({ ok: true });
});

/* ---------------- Members & invitations ---------------- */

// Add by email. If no account matches, responds 404 with { not_found: true } so the UI can offer an invite.
router.post('/groups/:id/members', member(['host', 'cohost']), async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const { rows } = await query('SELECT id, name, email FROM users WHERE email = $1', [email]);
  if (!rows[0]) {
    return res.status(404).json({ not_found: true, email, error: 'This email doesn’t match a current user.' });
  }
  const exists = await query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [req.group.id, rows[0].id]);
  if (exists.rowCount) return res.status(409).json({ error: `${displayName(rows[0])} is already in this group.` });
  await addMember(req.group.id, rows[0].id);
  res.status(201).json({ member: { id: rows[0].id, name: displayName(rows[0]) } });
});

// Change a member's role (host only). Body: { role: 'cohost' | 'member' }
router.patch('/groups/:id/members/:userId', member(['host']), async (req, res) => {
  const userId = intParam(req.params.userId);
  const role = req.body.role === 'cohost' ? 'cohost' : 'member';
  if (userId === req.user.id) return res.status(400).json({ error: 'You are the host of this group.' });
  const { rowCount } = await query(`UPDATE group_members SET role = $3 WHERE group_id = $1 AND user_id = $2 AND role <> 'host'`, [
    req.group.id,
    userId,
    role,
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Member not found.' });
  res.json({ ok: true });
});

// Remove a member (host/co-host), or leave the group (yourself).
router.delete('/groups/:id/members/:userId', member(), async (req, res) => {
  const userId = intParam(req.params.userId);
  const self = userId === req.user.id;
  if (!self && !isManager(req.group.my_role)) return res.status(403).json({ error: 'Only the host or co-hosts can remove members.' });
  const target = await query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [req.group.id, userId]);
  if (!target.rows[0]) return res.status(404).json({ error: 'Member not found.' });
  if (target.rows[0].role === 'host') {
    return res.status(400).json({ error: self ? 'As the host, you can delete the group instead of leaving it.' : 'The host can’t be removed.' });
  }
  if (!self && target.rows[0].role === 'cohost' && req.group.my_role !== 'host') {
    return res.status(403).json({ error: 'Only the host can remove a co-host.' });
  }
  await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.group.id, userId]);
  res.json({ ok: true });
});

// Create (or reuse) an invitation for someone without an account.
router.post('/groups/:id/invites', member(['host', 'cohost']), async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const existing = await query('SELECT * FROM group_invites WHERE group_id = $1 AND lower(email) = $2 AND accepted_at IS NULL', [
    req.group.id,
    email,
  ]);
  const invite =
    existing.rows[0] ||
    (
      await query('INSERT INTO group_invites (group_id, email, token, invited_by) VALUES ($1, $2, $3, $4) RETURNING *', [
        req.group.id,
        email,
        crypto.randomBytes(18).toString('base64url'),
        req.user.id,
      ])
    ).rows[0];
  res.status(201).json({
    invite: { id: invite.id, email: invite.email, token: invite.token },
    inviter_name: displayName(req.user),
  });
});

router.delete('/groups/:id/invites/:inviteId', member(['host', 'cohost']), async (req, res) => {
  await query('DELETE FROM group_invites WHERE id = $1 AND group_id = $2', [intParam(req.params.inviteId), req.group.id]);
  res.json({ ok: true });
});

/* ---------------- Assignments (manual pacing) ---------------- */

router.post('/groups/:id/assignments', member(['host', 'cohost']), async (req, res) => {
  const sectionId = intParam(req.body.section_id);
  if (!isDate(req.body.due_date)) return res.status(400).json({ error: 'Choose a due date.' });
  const s = await query('SELECT id FROM sections WHERE id = $1 AND book_id = $2', [sectionId, req.group.book_id]);
  if (!s.rows[0]) return res.status(400).json({ error: 'Choose how far to read.' });
  const { rows } = await query(
    'INSERT INTO group_assignments (group_id, section_id, due_date, note) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.group.id, sectionId, req.body.due_date, String(req.body.note || '').trim().slice(0, 500)],
  );
  res.status(201).json({ id: rows[0].id });
});

router.patch('/groups/:id/assignments/:aid', member(['host', 'cohost']), async (req, res) => {
  const sectionId = intParam(req.body.section_id);
  if (!isDate(req.body.due_date)) return res.status(400).json({ error: 'Choose a due date.' });
  const s = await query('SELECT id FROM sections WHERE id = $1 AND book_id = $2', [sectionId, req.group.book_id]);
  if (!s.rows[0]) return res.status(400).json({ error: 'Choose how far to read.' });
  await query('UPDATE group_assignments SET section_id = $3, due_date = $4, note = $5 WHERE id = $1 AND group_id = $2', [
    intParam(req.params.aid),
    req.group.id,
    sectionId,
    req.body.due_date,
    String(req.body.note || '').trim().slice(0, 500),
  ]);
  res.json({ ok: true });
});

router.delete('/groups/:id/assignments/:aid', member(['host', 'cohost']), async (req, res) => {
  await query('DELETE FROM group_assignments WHERE id = $1 AND group_id = $2', [intParam(req.params.aid), req.group.id]);
  res.json({ ok: true });
});

/* ---------------- Message board ---------------- */

router.get('/groups/:id/messages', member(), async (req, res) => {
  const after = intParam(req.query.after) || 0;
  const { rows } = await query(
    `SELECT gm.id, gm.body, gm.created_at, gm.user_id, u.name, u.email
     FROM group_messages gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.id > $2
     ORDER BY gm.id DESC LIMIT 200`,
    [req.group.id, after],
  );
  res.json({
    messages: rows.reverse().map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, user_id: m.user_id, name: displayName(m) })),
  });
});

router.post('/groups/:id/messages', member(), async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 5000);
  if (!body) return res.status(400).json({ error: 'Write a message first.' });
  const { rows } = await query('INSERT INTO group_messages (group_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at', [
    req.group.id,
    req.user.id,
    body,
  ]);
  res.status(201).json({ message: { ...rows[0], user_id: req.user.id, name: displayName(req.user) } });
});

router.delete('/groups/:id/messages/:mid', member(), async (req, res) => {
  const manager = isManager(req.group.my_role);
  const { rowCount } = await query(
    `DELETE FROM group_messages WHERE id = $1 AND group_id = $2 AND (user_id = $3 OR $4)`,
    [intParam(req.params.mid), req.group.id, req.user.id, manager],
  );
  if (!rowCount) return res.status(404).json({ error: 'Message not found.' });
  res.json({ ok: true });
});

/* ---------------- Group notes ---------------- */

router.get('/groups/:id/notes', member(), async (req, res) => {
  const { rows } = await query(
    `SELECT n.id, n.body, n.created_at, n.updated_at, n.paragraph_id, n.user_id, u.name, u.email,
            p.original, p.modern, s.id AS section_id, s.title AS section_title, c.title AS chapter_title
     FROM notes n
     JOIN users u ON u.id = n.user_id
     JOIN paragraphs p ON p.id = n.paragraph_id
     JOIN sections s ON s.id = p.section_id
     JOIN chapters c ON c.id = s.chapter_id
     WHERE n.group_id = $1
     ORDER BY p.seq, n.created_at`,
    [req.group.id],
  );
  res.json({ notes: rows.map(({ email, name, ...n }) => ({ ...n, author: displayName({ name, email }) })) });
});

export default router;

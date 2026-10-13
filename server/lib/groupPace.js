// Reading-group pacing. Dates are the reader's local calendar dates ('YYYY-MM-DD').
//
// Auto mode: the group reads the whole book evenly from start_date to target_date.
// Manual mode: hosts set assignments ("read through <section> by <date>").
// For each member we work out where the group should be, how far behind they are, and a daily
// amount that gets them back with the group (new members get a catch-up plan).
import { query } from '../db.js';
import { daysBetween, locate } from './goals.js';

const CATCH_UP_DAYS = 7;

export async function bookTotals(bookId) {
  const { rows } = await query('SELECT count(*)::int AS total FROM paragraphs WHERE book_id = $1', [bookId]);
  return rows[0].total;
}

export async function groupAssignments(groupId) {
  const { rows } = await query(
    `SELECT a.id, a.section_id, a.due_date, a.note, s.title AS section_title, c.title AS chapter_title,
            (SELECT max(p.seq) FROM paragraphs p WHERE p.section_id = a.section_id) AS through_seq
     FROM group_assignments a
     JOIN sections s ON s.id = a.section_id
     JOIN chapters c ON c.id = s.chapter_id
     WHERE a.group_id = $1
     ORDER BY a.due_date, through_seq`,
    [groupId],
  );
  return rows.map((r) => ({ ...r, through_seq: r.through_seq || 0 }));
}

// Where the group should have reached by the end of `day` (auto mode).
function autoTarget(group, total, day) {
  const totalDays = Math.max(1, daysBetween(group.start_date, group.target_date) + 1);
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(group.start_date, day) + 1));
  return Math.min(total, Math.ceil((total * elapsed) / totalDays));
}

/** Group-level schedule: where everyone should be by today, and the next milestone. */
export async function groupSchedule(group, total, assignments, today) {
  if (group.pace_mode === 'auto' && group.target_date) {
    const totalDays = Math.max(1, daysBetween(group.start_date, group.target_date) + 1);
    const targetSeq = autoTarget(group, total, today);
    return {
      mode: 'auto',
      daily: Math.max(1, Math.ceil(total / totalDays)),
      target_seq: targetSeq,
      target: targetSeq ? await locate({ query }, group.book_id, targetSeq) : null,
      days_left: Math.max(0, daysBetween(today, group.target_date) + 1),
      finished: daysBetween(today, group.target_date) < 0,
    };
  }
  const past = assignments.filter((a) => daysBetween(a.due_date, today) >= 0);
  const next = assignments.find((a) => daysBetween(today, a.due_date) >= 0);
  return {
    mode: 'manual',
    // The group should have finished every assignment due before today, and be working on the next one.
    target_seq: past.length ? Math.max(...past.map((a) => a.through_seq)) : 0,
    current: next || null,
  };
}

/** One member's standing against the group schedule. */
export function memberPace(group, total, schedule, assignments, maxSeq, today) {
  const done = Math.min(maxSeq, total);
  const base = { done, total, percent: total ? Math.round((done / total) * 1000) / 10 : 0, finished: total > 0 && done >= total };
  if (base.finished) return { ...base, status: 'finished', today_left: 0, daily: 0 };

  if (schedule.mode === 'auto') {
    const daysLeft = Math.max(1, daysBetween(today, group.target_date) + 1);
    const behind = Math.max(0, schedule.target_seq - done);
    if (behind === 0) return { ...base, status: 'on_track', today_left: 0, daily: schedule.daily, behind: 0 };
    if (behind <= schedule.daily) {
      return { ...base, status: 'today', today_left: behind, daily: schedule.daily, behind: 0 };
    }
    // Behind by more than a day's reading: catch up with the group over the next week (or what's left).
    const days = Math.min(CATCH_UP_DAYS, daysLeft);
    const end = new Date(`${today}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days - 1);
    const goalSeq = autoTarget(group, total, end.toISOString().slice(0, 10));
    const daily = Math.ceil((goalSeq - done) / days);
    return { ...base, status: 'behind', behind, catch_up_days: days, daily, today_left: daily, group_daily: schedule.daily };
  }

  // Manual mode
  const overdue = assignments.filter((a) => daysBetween(a.due_date, today) > 0 && a.through_seq > done);
  const next = assignments.find((a) => daysBetween(today, a.due_date) >= 0 && a.through_seq > done);
  if (!next) {
    if (overdue.length) {
      const last = overdue[overdue.length - 1];
      return { ...base, status: 'behind', behind: last.through_seq - done, overdue: overdue.length, today_left: last.through_seq - done, daily: last.through_seq - done };
    }
    return { ...base, status: assignments.length ? 'on_track' : 'no_assignment', today_left: 0, daily: 0 };
  }
  const days = Math.max(1, daysBetween(today, next.due_date) + 1);
  const needed = next.through_seq - done;
  const daily = Math.ceil(needed / days);
  return {
    ...base,
    status: overdue.length ? 'behind' : 'today',
    behind: overdue.length ? Math.max(0, Math.max(...overdue.map((a) => a.through_seq)) - done) : 0,
    overdue: overdue.length,
    next_assignment_id: next.id,
    daily,
    today_left: daily,
    days_to_due: days,
  };
}

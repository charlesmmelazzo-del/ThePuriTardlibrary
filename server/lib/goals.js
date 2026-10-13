// Reading-goal math. All dates are the reader's local calendar dates as 'YYYY-MM-DD'.

const DAY = 86400000;
const toUtc = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
};
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY);
export const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toUtc(d));

export function todayFrom(req) {
  const d = req.query.today || req.body?.today;
  return isDate(d) ? d : new Date().toISOString().slice(0, 10);
}

export async function locate(db, bookId, seq) {
  const { rows } = await db.query(
    `SELECT p.id AS paragraph_id, s.id AS section_id, s.title AS section_title, c.title AS chapter_title
     FROM paragraphs p JOIN sections s ON s.id = p.section_id JOIN chapters c ON c.id = s.chapter_id
     WHERE p.book_id = $1 AND p.seq = $2`,
    [bookId, seq],
  );
  return rows[0] || null;
}

export async function goalStatus(db, goal, today) {
  const { book_id: bookId, user_id: userId } = goal;
  const [{ rows: [totals] }, { rows: [prog] }, { rows: [todayRow] }, { rows: [lastDay] }] = await Promise.all([
    db.query('SELECT count(*)::int AS total, coalesce(sum(word_count),0)::int AS words FROM paragraphs WHERE book_id = $1', [bookId]),
    db.query('SELECT max_seq FROM progress WHERE user_id = $1 AND book_id = $2', [userId, bookId]),
    db.query('SELECT start_seq, end_seq FROM reading_days WHERE user_id = $1 AND book_id = $2 AND day = $3', [userId, bookId, today]),
    db.query(
      'SELECT max(day) AS day FROM reading_days WHERE user_id = $1 AND book_id = $2 AND day < $3 AND end_seq > start_seq',
      [userId, bookId, today],
    ),
  ]);

  const total = totals.total;
  const done = Math.min(prog?.max_seq || 0, total);
  const startToday = Math.min(todayRow ? todayRow.start_seq : done, done);
  const remaining = total - done;

  const totalDays = Math.max(1, daysBetween(goal.start_date, goal.target_date) + 1);
  const overdue = daysBetween(today, goal.target_date) < 0;
  const daysLeft = overdue ? 1 : daysBetween(today, goal.target_date) + 1;

  const originalPace = Math.max(1, Math.ceil((total - Math.min(goal.start_seq, total)) / totalDays));
  const dailyTarget = total === 0 ? 0 : Math.ceil((total - startToday) / daysLeft);
  const readToday = done - startToday;
  const todayLeft = Math.max(0, dailyTarget - readToday);

  // Where the reader "should" be by the start of today if they had kept the original pace.
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(goal.start_date, today)));
  const expectedByToday = Math.min(total, goal.start_seq + originalPace * elapsed);
  const behindBy = Math.max(0, expectedByToday - startToday);

  const targetSeq = Math.min(total, startToday + dailyTarget);
  const [target, wordsLeftToday] = await Promise.all([
    targetSeq > 0 ? locate(db, bookId, targetSeq) : null,
    db.query('SELECT coalesce(sum(word_count),0)::int AS w FROM paragraphs WHERE book_id = $1 AND seq > $2 AND seq <= $3', [
      bookId,
      done,
      targetSeq,
    ]),
  ]);

  return {
    id: goal.id,
    book_id: bookId,
    start_date: goal.start_date,
    target_date: goal.target_date,
    total_paragraphs: total,
    done_paragraphs: done,
    remaining_paragraphs: remaining,
    percent: total ? Math.round((done / total) * 1000) / 10 : 0,
    days_total: totalDays,
    days_left: daysLeft,
    overdue,
    complete: total > 0 && done >= total,
    original_daily: originalPace,
    daily_target: dailyTarget,
    read_today: readToday,
    today_left: todayLeft,
    today_done: todayLeft === 0,
    behind: behindBy > 0 && dailyTarget > originalPace,
    behind_by: behindBy,
    minutes_left_today: Math.ceil(wordsLeftToday.rows[0].w / 200),
    today_target: target,
    last_read_day: lastDay?.day || null,
    days_since_read: lastDay?.day ? daysBetween(lastDay.day, today) : null,
  };
}

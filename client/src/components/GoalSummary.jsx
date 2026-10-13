import { Link } from 'react-router-dom';
import { formatDate, plural } from '../lib/api.js';

/** Plain-language description of where a reader stands on a reading goal. */
export function goalMessage(g) {
  if (g.complete) return { tone: 'done', text: 'You finished this book. Well done!' };
  if (g.overdue) {
    return {
      tone: 'behind',
      text: `Your finish date (${formatDate(g.target_date)}) has passed. ${plural(g.remaining_paragraphs, 'paragraph')} to go. Finish them today, or set a new date.`,
    };
  }
  if (g.today_done) {
    return {
      tone: 'done',
      text: `Today's reading is done${g.read_today > g.daily_target ? ', and then some' : ''}. Come back tomorrow to keep your pace.`,
    };
  }
  const where = g.today_target
    ? ` That takes you to ${g.today_target.chapter_title}${g.today_target.section_title ? ` › ${g.today_target.section_title}` : ''}.`
    : '';
  const minutes = g.minutes_left_today ? ` (about ${plural(g.minutes_left_today, 'minute')})` : '';
  if (g.behind) {
    const away = g.days_since_read && g.days_since_read > 1 ? `You've been away ${plural(g.days_since_read, 'day')}. ` : '';
    return {
      tone: 'behind',
      text: `${away}To catch up and still finish by ${formatDate(g.target_date)}, read ${plural(g.daily_target, 'paragraph')} a day for the next ${plural(g.days_left, 'day')} (it was ${g.original_daily}). Today: ${g.today_left} left${minutes}.${where}`,
    };
  }
  return {
    tone: 'ok',
    text: `Today: read ${plural(g.today_left, 'more paragraph', 'more paragraphs')}${minutes}.${where}`,
  };
}

export function ProgressBar({ percent, label }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-fill" style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

export default function GoalSummary({ goal, showBook = false, compact = false, continueTo }) {
  const msg = goalMessage(goal);
  return (
    <div className={`goal-summary tone-${msg.tone} ${compact ? 'compact' : ''}`}>
      {showBook && (
        <div className="goal-book">
          <Link to={`/books/${goal.book_id}`}>{goal.book_title}</Link>
          <span className="muted"> · finish by {formatDate(goal.target_date)}</span>
        </div>
      )}
      <p>{msg.text}</p>
      <ProgressBar percent={goal.percent} label="Book progress" />
      <div className="goal-meta muted">
        <span>
          {goal.done_paragraphs} of {goal.total_paragraphs} paragraphs · {goal.percent}%
        </span>
        {!goal.complete && !goal.overdue && <span>{plural(goal.days_left, 'day')} left</span>}
      </div>
      {continueTo && !goal.complete && (
        <Link className="btn primary small" to={continueTo}>
          Continue reading
        </Link>
      )}
    </div>
  );
}

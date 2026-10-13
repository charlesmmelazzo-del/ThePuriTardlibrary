import { formatDate } from './api.js';

export const inviteUrl = (token) => `${window.location.origin}/invite/${token}`;

/** A mailto: link with the invitation already written, addressed to the invitee. */
export function inviteMailto({ email, token, inviterName, group, appName }) {
  const subject = `You've been invited by ${inviterName} to join a ${group.book_title} book group!`;
  const finish = group.pace_mode === 'auto' && group.target_date ? ` We're planning to finish by ${formatDate(group.target_date)}.` : '';
  const body = [
    'Hi there,',
    '',
    `${inviterName} has invited you to join "${group.name}", a reading group for ${group.book_title}${
      group.book_author ? ` by ${group.book_author}` : ''
    } on ${appName}.${finish}`,
    '',
    "You'll read the original text side by side with clear modern English, follow the group's reading plan, share notes, and talk it over together.",
    '',
    '>>> JOIN THE GROUP HERE <<<',
    inviteUrl(token),
    '',
    'The link takes you to a quick sign-up with your email already filled in. Just add your name and a password and you will be in the group.',
    '',
    'See you there!',
    inviterName,
  ].join('\n');
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Plain-language description of a member's pace in a group. */
export function paceMessage(pace, schedule, assignments = []) {
  if (!pace) return { tone: 'ok', text: '' };
  const where = (t) => (t ? `${t.chapter_title}${t.section_title ? ` › ${t.section_title}` : ''}` : '');
  if (pace.finished) return { tone: 'done', text: 'You’ve finished the book. Well done!' };
  if (schedule.mode === 'auto') {
    if (pace.status === 'on_track') return { tone: 'done', text: 'You’re caught up with the group. Nothing more to read today.' };
    if (pace.status === 'today') {
      return {
        tone: 'ok',
        text: `Today: read ${pace.today_left} more paragraph${pace.today_left === 1 ? '' : 's'} to keep pace with the group${
          schedule.target ? ` (up to ${where(schedule.target)})` : ''
        }.`,
      };
    }
    return {
      tone: 'behind',
      text: `You’re ${pace.behind} paragraphs behind the group. Read ${pace.daily} a day for the next ${pace.catch_up_days} day${
        pace.catch_up_days === 1 ? '' : 's'
      } to catch up (the group reads about ${pace.group_daily} a day).`,
    };
  }
  if (pace.status === 'no_assignment') return { tone: 'ok', text: 'No reading has been assigned yet.' };
  if (pace.status === 'on_track') return { tone: 'done', text: 'You’re up to date with every assigned reading.' };
  const next = assignments.find((a) => a.id === pace.next_assignment_id);
  if (pace.status === 'behind' && !next) {
    return { tone: 'behind', text: `You’re behind on the assigned reading: ${pace.behind} paragraphs to go to catch up.` };
  }
  const due = next ? `through ${where(next)}, due ${new Date(`${next.due_date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
  if (pace.status === 'behind') {
    return {
      tone: 'behind',
      text: `You’re behind (${pace.overdue} reading${pace.overdue === 1 ? '' : 's'} overdue). Read ${pace.daily} paragraphs a day to catch up and finish the current reading (${due}).`,
    };
  }
  return { tone: 'ok', text: `Current reading: ${due}. Read ${pace.daily} paragraph${pace.daily === 1 ? '' : 's'} a day to finish on time.` };
}

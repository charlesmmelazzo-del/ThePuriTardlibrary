import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, api, formatDate, today } from '../lib/api.js';
import Cover from '../components/Cover.jsx';
import Icon from '../components/Icon.jsx';
import { ProgressBar } from '../components/GoalSummary.jsx';
import { paceMessage } from '../lib/invite.js';

const ROLE_LABEL = { host: 'Host', cohost: 'Co-host', member: 'Member' };

export function GroupCard({ g }) {
  const msg = paceMessage(g.my_pace, g.schedule);
  return (
    <Link to={`/groups/${g.id}`} className="card group-card">
      <Cover book={{ title: g.book_title, author: g.book_author, cover_url: g.cover_url }} size="sm" />
      <div className="group-card-body">
        <div className="eyebrow">
          {ROLE_LABEL[g.my_role]} · {g.member_count} reader{g.member_count === 1 ? '' : 's'}
        </div>
        <h3>{g.name}</h3>
        <div className="muted small">
          {g.book_title}
          {g.pace_mode === 'auto' && g.target_date ? ` · finish by ${formatDate(g.target_date)}` : ' · readings set by the host'}
        </div>
        <ProgressBar percent={g.my_pace?.percent || 0} label="Your progress" />
        {msg.text && <p className={`small pace-line tone-${msg.tone}`}>{msg.text}</p>}
      </div>
    </Link>
  );
}

function CreateGroup({ books, initialBookId, onCancel }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    book_id: initialBookId || '',
    pace_mode: 'auto',
    target_date: addDays(today(), 29),
  });
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section className="card">
      <h2>Start a reading group</h2>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const list = emails
              .split(/[\s,;]+/)
              .map((x) => x.trim())
              .filter(Boolean);
            const res = await api('/groups', { method: 'POST', body: { ...form, book_id: Number(form.book_id), emails: list, today: today() } });
            navigate(`/groups/${res.group_id}`, { state: { added: res.added, unmatched: res.unmatched } });
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        <label>
          Group name
          <input required value={form.name} onChange={set('name')} placeholder="e.g. Tuesday Night Owen" />
        </label>
        <label>
          Book
          <select required value={form.book_id} onChange={set('book_id')}>
            <option value="">Choose a book…</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="radio-cards">
          <legend>Reading pace</legend>
          <label className={`radio-card ${form.pace_mode === 'auto' ? 'active' : ''}`}>
            <input type="radio" name="pace" value="auto" checked={form.pace_mode === 'auto'} onChange={set('pace_mode')} />
            <span>
              <strong>Set a pace for us</strong>
              <span className="muted small">Pick a finish date. The app works out how much everyone reads each day.</span>
            </span>
          </label>
          <label className={`radio-card ${form.pace_mode === 'manual' ? 'active' : ''}`}>
            <input type="radio" name="pace" value="manual" checked={form.pace_mode === 'manual'} onChange={set('pace_mode')} />
            <span>
              <strong>I’ll assign readings</strong>
              <span className="muted small">You set each reading (“through Chapter III by Friday”) as you go.</span>
            </span>
          </label>
        </fieldset>
        {form.pace_mode === 'auto' && (
          <label>
            Finish the book by
            <input type="date" min={today()} required value={form.target_date} onChange={set('target_date')} />
          </label>
        )}
        <label>
          Add people <span className="muted">(optional — email addresses, separated by commas or new lines)</span>
          <textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="friend@example.com, another@example.com" />
        </label>
        <p className="muted small">You can add more people at any time. Anyone without an account can be sent an invitation.</p>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

export default function Groups() {
  const [params, setParams] = useSearchParams();
  const [groups, setGroups] = useState(null);
  const [books, setBooks] = useState([]);
  const [error, setError] = useState('');
  const creating = params.has('new');

  useEffect(() => {
    api(`/groups?today=${today()}`).then((d) => setGroups(d.groups)).catch((e) => setError(e.message));
    api('/books').then((d) => setBooks(d.books.filter((b) => b.total_paragraphs > 0))).catch(() => {});
  }, []);

  return (
    <div className="page">
      <div className="toolbar">
        <h1>Reading groups</h1>
        {!creating && (
          <button className="btn primary" onClick={() => setParams({ new: '' })}>
            <Icon name="plus" size={18} /> Start a group
          </button>
        )}
      </div>
      <p className="muted">
        Read a book together: share a reading plan, see how everyone is getting on, leave notes for the group, and talk it over.
      </p>
      {creating && <CreateGroup books={books} initialBookId={params.get('book') || ''} onCancel={() => setParams({})} />}
      {error && <div className="error">{error}</div>}
      {groups && groups.length === 0 && !creating && (
        <div className="empty">
          <p>You’re not in any reading groups yet. Start one and invite some friends.</p>
        </div>
      )}
      <div className="group-list">
        {groups?.map((g) => (
          <GroupCard key={g.id} g={g} />
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, formatDate, formatDateTime, today } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import { paceMessage, timeAgo } from '../lib/invite.js';
import { inviteUrl } from '../lib/invite.js';
import Cover from '../components/Cover.jsx';
import Icon from '../components/Icon.jsx';
import AddMember, { InvitePrompt } from '../components/AddMember.jsx';
import { copyText } from '../components/ShareSheet.jsx';

const ROLE_LABEL = { host: 'Host', cohost: 'Co-host', member: 'Member' };
const where = (t) => (t ? `${t.chapter_title}${t.section_title ? ` › ${t.section_title}` : ''}` : '');
const shortDate = (d) => new Date(`${d}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function Avatar({ name }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ background: `hsl(${h} 35% 42%)` }} aria-hidden="true">
      {initials}
    </span>
  );
}

function memberStatus(m) {
  const p = m.pace;
  if (p.finished) return { tone: 'done', text: 'Finished the book' };
  if (p.status === 'on_track') return { tone: 'done', text: 'Caught up' };
  if (p.status === 'no_assignment') return { tone: 'ok', text: `${p.percent}% read` };
  if (p.status === 'behind') return { tone: 'behind', text: `Behind by ${p.behind} paragraph${p.behind === 1 ? '' : 's'}` };
  return { tone: 'ok', text: `${p.today_left} to go today` };
}

/* ---------------- Progress tab ---------------- */

function ProgressTab({ data, reload, manager }) {
  const { user } = useApp();
  const { group, schedule, members, assignments, my_pace: myPace, total_paragraphs: total } = data;
  const msg = paceMessage(myPace, schedule, assignments);
  const groupPct = total ? Math.min(100, (schedule.target_seq / total) * 100) : 0;

  return (
    <>
      <section className={`card my-pace tone-${msg.tone}`}>
        <div className="eyebrow">Your pace</div>
        <p className="pace-text">{msg.text}</p>
        <div className="row">
          {data.resume_section_id && (
            <Link className="btn primary" to={`/read/${group.book_id}/${data.resume_section_id}`}>
              <Icon name="book" size={18} /> {myPace?.done ? 'Continue reading' : 'Start reading'}
            </Link>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Reading plan</h2>
        </div>
        {schedule.mode === 'auto' ? (
          <div className="plan-auto">
            <p>
              The group reads about <strong>{schedule.daily}</strong> paragraphs a day to finish by{' '}
              <strong>{formatDate(group.target_date)}</strong>
              {schedule.finished ? ' (that date has passed).' : ` — ${schedule.days_left} day${schedule.days_left === 1 ? '' : 's'} to go.`}
            </p>
            {schedule.target && !schedule.finished && (
              <p className="muted">
                By the end of today the group should be at <strong>{where(schedule.target)}</strong>.
              </p>
            )}
          </div>
        ) : (
          <Assignments data={data} reload={reload} manager={manager} />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Everyone’s progress</h2>
          <span className="muted small">{members.length} reader{members.length === 1 ? '' : 's'}</span>
        </div>
        <ul className="member-progress">
          {members.map((m) => {
            const st = memberStatus(m);
            return (
              <li key={m.id}>
                <Avatar name={m.name} />
                <div className="mp-body">
                  <div className="mp-top">
                    <span className="mp-name">
                      {m.id === user.id ? `${m.name} (you)` : m.name}
                      {m.role !== 'member' && <span className="badge">{ROLE_LABEL[m.role]}</span>}
                    </span>
                    <span className={`mp-status tone-${st.tone}`}>{st.text}</span>
                  </div>
                  <div className="mp-bar" title={`${m.pace.percent}% read`}>
                    <div className="progress">
                      <div className="progress-fill" style={{ width: `${m.pace.percent}%` }} />
                    </div>
                    {groupPct > 0 && <span className="mp-marker" style={{ left: `${groupPct}%` }} title="Where the group should be today" />}
                  </div>
                  <div className="mp-meta muted small">
                    <span>{m.pace.percent}% read</span>
                    <span>
                      {m.read_today > 0 ? (
                        <span className="read-today">
                          <Icon name="check" size={13} /> Read {m.read_today} today
                        </span>
                      ) : m.last_read_at ? (
                        `Last read ${timeAgo(m.last_read_at)}`
                      ) : (
                        'Hasn’t started yet'
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {groupPct > 0 && (
          <p className="muted small legend">
            <span className="mp-marker static" /> marks where the group should be by today.
          </p>
        )}
      </section>
    </>
  );
}

function AssignmentForm({ sections, initial, onSave, onCancel }) {
  const [sectionId, setSectionId] = useState(initial?.section_id || '');
  const [due, setDue] = useState(initial?.due_date || today());
  const [note, setNote] = useState(initial?.note || '');
  const [error, setError] = useState('');
  return (
    <form
      className="assignment-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          await onSave({ section_id: Number(sectionId), due_date: due, note });
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <label>
        Read through
        <select required value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">Choose where to stop…</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.chapter_title}
              {s.title ? ` › ${s.title}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Due
        <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <label className="grow">
        Note <span className="muted">(optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. We’ll discuss this on Tuesday" />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary small">Save reading</button>
        <button type="button" className="btn small ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Assignments({ data, reload, manager }) {
  const { group, assignments, my_pace: myPace, sections } = data;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const t = today();
  const save = async (body, id) => {
    await api(id ? `/groups/${group.id}/assignments/${id}` : `/groups/${group.id}/assignments`, { method: id ? 'PATCH' : 'POST', body });
    setAdding(false);
    setEditing(null);
    reload();
  };
  return (
    <div>
      {assignments.length === 0 && <p className="muted">No readings assigned yet.{manager ? ' Add the first one below.' : ''}</p>}
      <ol className="assignments">
        {assignments.map((a) => {
          const done = myPace && myPace.done >= a.through_seq;
          const overdue = !done && a.due_date < t;
          return editing === a.id ? (
            <li key={a.id}>
              <AssignmentForm sections={sections} initial={a} onSave={(b) => save(b, a.id)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className={done ? 'done' : overdue ? 'overdue' : ''}>
              <span className={`toc-dot ${done ? 'done' : ''}`}>{done ? <Icon name="check" size={12} /> : null}</span>
              <div className="grow">
                <div>
                  Read through <strong>{where(a)}</strong>
                </div>
                <div className="muted small">
                  Due {shortDate(a.due_date)}
                  {overdue ? ' · overdue' : ''}
                  {a.note ? ` · ${a.note}` : ''}
                </div>
              </div>
              {manager && (
                <span className="row">
                  <button className="icon-btn" onClick={() => setEditing(a.id)} aria-label="Edit reading">
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label="Delete reading"
                    onClick={async () => {
                      if (!confirm('Delete this reading?')) return;
                      await api(`/groups/${group.id}/assignments/${a.id}`, { method: 'DELETE' });
                      reload();
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {manager &&
        (adding ? (
          <AssignmentForm sections={sections} onSave={(b) => save(b)} onCancel={() => setAdding(false)} />
        ) : (
          <button className="btn small" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> Assign a reading
          </button>
        ))}
    </div>
  );
}

/* ---------------- Discussion tab ---------------- */

function Discussion({ group, manager }) {
  const { user } = useApp();
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const lastId = useRef(0);
  const endRef = useRef(null);

  const fetchNew = useCallback(async () => {
    const d = await api(`/groups/${group.id}/messages?after=${lastId.current}`);
    if (d.messages.length) {
      lastId.current = d.messages[d.messages.length - 1].id;
      setMessages((m) => [...(m || []), ...d.messages]);
    } else {
      setMessages((m) => m || []);
    }
  }, [group.id]);

  useEffect(() => {
    lastId.current = 0;
    setMessages(null);
    fetchNew().catch((e) => setError(e.message));
    const t = setInterval(() => document.visibilityState === 'visible' && fetchNew().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [fetchNew]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setError('');
    try {
      await api(`/groups/${group.id}/messages`, { method: 'POST', body: { body } });
      setBody('');
      await fetchNew();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="card discussion">
      <div className="card-head">
        <h2>Discussion</h2>
        <span className="muted small">Questions, thoughts and encouragement for the group</span>
      </div>
      {messages === null && <p className="muted">Loading…</p>}
      {messages?.length === 0 && <p className="muted">No messages yet. Start the conversation!</p>}
      <ul className="messages">
        {messages?.map((m) => (
          <li key={m.id} className={m.user_id === user.id ? 'mine' : ''}>
            <Avatar name={m.name} />
            <div className="msg">
              <div className="msg-head">
                <strong>{m.user_id === user.id ? 'You' : m.name}</strong>
                <span className="muted small" title={formatDateTime(m.created_at)}>
                  {timeAgo(m.created_at)}
                </span>
                {(m.user_id === user.id || manager) && (
                  <button
                    className="link-btn danger small"
                    onClick={async () => {
                      if (!confirm('Delete this message?')) return;
                      await api(`/groups/${group.id}/messages/${m.id}`, { method: 'DELETE' });
                      setMessages((all) => all.filter((x) => x.id !== m.id));
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <p>{m.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div ref={endRef} />
      <form className="composer" onSubmit={send}>
        <textarea
          rows={2}
          placeholder="Ask a question or share a thought…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e);
          }}
          aria-label="Message"
        />
        <button className="btn primary" disabled={!body.trim()}>
          <Icon name="send" size={18} /> Send
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </section>
  );
}

/* ---------------- Group notes tab ---------------- */

function GroupNotes({ group }) {
  const [notes, setNotes] = useState(null);
  useEffect(() => {
    api(`/groups/${group.id}/notes`).then((d) => setNotes(d.notes)).catch(() => setNotes([]));
  }, [group.id]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Group notes</h2>
      </div>
      <p className="muted small">
        Notes members have shared with the group. To add one, open the book, tap <strong>Note</strong> under a paragraph, and choose this group
        under “Visible to”.
      </p>
      {notes === null && <p className="muted">Loading…</p>}
      {notes?.length === 0 && <p className="muted">No group notes yet.</p>}
      {notes?.map((n) => (
        <Link key={n.id} className="group-note-item" to={`/read/${group.book_id}/${n.section_id}#p-${n.paragraph_id}`}>
          <blockquote className="note-quote">{n.modern || n.original}</blockquote>
          <p className="note-body">{n.body}</p>
          <div className="muted small">
            {n.author} · {n.chapter_title}
            {n.section_title ? ` › ${n.section_title}` : ''} · {timeAgo(n.created_at)}
          </div>
        </Link>
      ))}
    </section>
  );
}

/* ---------------- Members tab ---------------- */

function Members({ data, reload }) {
  const { user } = useApp();
  const navigate = useNavigate();
  const { group, members, invites } = data;
  const manager = group.my_role === 'host' || group.my_role === 'cohost';
  const [copied, setCopied] = useState(null);

  const act = async (fn) => {
    try {
      await fn();
      reload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      {manager && (
        <section className="card">
          <h2>Add people</h2>
          <p className="muted small">Enter their email. If they already have an account they’re added right away; if not, you can send an invitation.</p>
          <AddMember group={group} onAdded={reload} />
        </section>
      )}
      <section className="card">
        <h2>Members</h2>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              <Avatar name={m.name} />
              <div className="grow">
                <div>
                  {m.id === user.id ? `${m.name} (you)` : m.name} <span className="badge">{ROLE_LABEL[m.role]}</span>
                </div>
                {m.email && <div className="muted small">{m.email}</div>}
              </div>
              <div className="row">
                {group.my_role === 'host' && m.role !== 'host' && (
                  <button
                    className="btn small"
                    onClick={() => act(() => api(`/groups/${group.id}/members/${m.id}`, { method: 'PATCH', body: { role: m.role === 'cohost' ? 'member' : 'cohost' } }))}
                  >
                    <Icon name="crown" size={15} /> {m.role === 'cohost' ? 'Remove co-host' : 'Make co-host'}
                  </button>
                )}
                {manager && m.role !== 'host' && m.id !== user.id && (group.my_role === 'host' || m.role === 'member') && (
                  <button
                    className="btn small ghost danger"
                    onClick={() => confirm(`Remove ${m.name} from the group?`) && act(() => api(`/groups/${group.id}/members/${m.id}`, { method: 'DELETE' }))}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {group.my_role !== 'host' && (
          <button
            className="btn small ghost danger"
            onClick={async () => {
              if (!confirm(`Leave “${group.name}”?`)) return;
              await api(`/groups/${group.id}/members/${user.id}`, { method: 'DELETE' });
              navigate('/groups');
            }}
          >
            Leave this group
          </button>
        )}
      </section>
      {manager && invites.length > 0 && (
        <section className="card">
          <h2>Waiting to join</h2>
          <p className="muted small">Invitations that haven’t been accepted yet. They’ll join automatically when they sign up.</p>
          <ul className="member-list">
            {invites.map((inv) => (
              <li key={inv.id}>
                <Icon name="mail" />
                <div className="grow">
                  <div>{inv.email}</div>
                  <div className="muted small">Invited {timeAgo(inv.created_at)}</div>
                </div>
                <button
                  className="btn small"
                  onClick={async () => {
                    if (await copyText(inviteUrl(inv.token))) setCopied(inv.id);
                  }}
                >
                  <Icon name="copy" size={15} /> {copied === inv.id ? 'Copied' : 'Copy link'}
                </button>
                <button className="btn small ghost danger" onClick={() => act(() => api(`/groups/${group.id}/invites/${inv.id}`, { method: 'DELETE' }))}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ---------------- Settings tab ---------------- */

function Settings({ data, reload }) {
  const navigate = useNavigate();
  const { group } = data;
  const [form, setForm] = useState({ name: group.name, pace_mode: group.pace_mode, target_date: group.target_date || '' });
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <section className="card">
      <h2>Group settings</h2>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg({ error: '', ok: '' });
          try {
            await api(`/groups/${group.id}`, { method: 'PATCH', body: form });
            setMsg({ error: '', ok: 'Saved.' });
            reload();
          } catch (err) {
            setMsg({ error: err.message, ok: '' });
          }
        }}
      >
        <label>
          Group name
          <input required value={form.name} onChange={set('name')} />
        </label>
        <label>
          Reading pace
          <select value={form.pace_mode} onChange={set('pace_mode')}>
            <option value="auto">Set a pace for us (finish by a date)</option>
            <option value="manual">Hosts assign readings</option>
          </select>
        </label>
        {form.pace_mode === 'auto' && (
          <label>
            Finish the book by
            <input type="date" required value={form.target_date} onChange={set('target_date')} />
          </label>
        )}
        {msg.error && <div className="error">{msg.error}</div>}
        {msg.ok && <div className="success">{msg.ok}</div>}
        <div className="row">
          <button className="btn primary">Save changes</button>
        </div>
      </form>
      {group.my_role === 'host' && (
        <div className="danger-zone">
          <h3>Delete group</h3>
          <p className="muted small">Removes the group, its discussion and its shared notes for everyone. Everyone keeps their own reading progress and private notes.</p>
          <button
            className="btn danger"
            onClick={async () => {
              if (prompt(`Type the group name to delete it:\n${group.name}`) !== group.name) return;
              await api(`/groups/${group.id}`, { method: 'DELETE' });
              navigate('/groups');
            }}
          >
            <Icon name="trash" size={16} /> Delete this group
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------------- Page ---------------- */

export default function GroupPage() {
  const { groupId } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pendingInvites, setPendingInvites] = useState(() => location.state?.unmatched || []);

  const load = useCallback(() => {
    api(`/groups/${groupId}?today=${today()}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [groupId]);
  useEffect(load, [load]);

  if (error) {
    return (
      <div className="page">
        <div className="error">{error}</div>
        <Link to="/groups">Back to your groups</Link>
      </div>
    );
  }
  if (!data) return <div className="page muted">Loading…</div>;

  const { group } = data;
  const manager = group.my_role === 'host' || group.my_role === 'cohost';
  const tabs = { progress: 'Progress', discussion: 'Discussion', notes: 'Group notes', members: 'Members', ...(manager ? { settings: 'Settings' } : {}) };
  const tab = tabs[params.get('tab')] ? params.get('tab') : 'progress';
  const added = location.state?.added || [];

  return (
    <div className="page group-page">
      <div className="group-hero">
        <Cover book={{ title: group.book_title, author: group.book_author, cover_url: group.cover_url }} size="sm" />
        <div>
          <div className="eyebrow">Reading group · {ROLE_LABEL[group.my_role]}</div>
          <h1>{group.name}</h1>
          <div className="muted">
            <Link to={`/books/${group.book_id}`}>{group.book_title}</Link> · {group.book_author}
          </div>
          <div className="muted small">
            {data.members.length} reader{data.members.length === 1 ? '' : 's'}
            {group.pace_mode === 'auto' && group.target_date ? ` · finishing by ${formatDate(group.target_date)}` : ' · readings set by the host'}
          </div>
        </div>
      </div>

      {(added.length > 0 || pendingInvites.length > 0) && (
        <section className="card">
          {added.length > 0 && <div className="success">Added to the group: {added.join(', ')}.</div>}
          {pendingInvites.map((email) => (
            <InvitePrompt
              key={email}
              email={email}
              group={group}
              onDone={load}
              onCancel={() => setPendingInvites((list) => list.filter((e) => e !== email))}
            />
          ))}
        </section>
      )}

      <div className="tabs" role="tablist">
        {Object.entries(tabs).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setParams({ tab: k }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'progress' && <ProgressTab data={data} reload={load} manager={manager} />}
      {tab === 'discussion' && <Discussion group={group} manager={manager} />}
      {tab === 'notes' && <GroupNotes group={group} />}
      {tab === 'members' && <Members data={data} reload={load} />}
      {tab === 'settings' && manager && <Settings data={data} reload={load} />}
    </div>
  );
}

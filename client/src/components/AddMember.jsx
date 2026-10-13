import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import { inviteMailto, inviteUrl } from '../lib/invite.js';
import { copyText } from './ShareSheet.jsx';
import Icon from './Icon.jsx';

/** "This email doesn't match a current user… invite them?" prompt, then opens a prefilled email. */
export function InvitePrompt({ email, group, onDone, onCancel }) {
  const { config } = useApp();
  const [sent, setSent] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    setError('');
    try {
      const { invite: inv, inviter_name: inviterName } = await api(`/groups/${group.id}/invites`, { method: 'POST', body: { email } });
      setSent(inv);
      window.location.href = inviteMailto({ email, token: inv.token, inviterName, group, appName: config.appName });
      onDone?.();
    } catch (e) {
      setError(e.message);
    }
  };

  if (sent) {
    return (
      <div className="invite-box sent">
        <p>
          <Icon name="mail" size={16} /> An invitation email to <strong>{email}</strong> should have opened in your email app — just press send.
        </p>
        <p className="muted small">
          If it didn’t open, copy the invite link and send it yourself. When they sign up with it, they’ll join the group automatically.
        </p>
        <div className="row">
          <button
            className="btn small"
            onClick={async () => {
              setCopied(await copyText(inviteUrl(sent.token)));
            }}
          >
            <Icon name="copy" size={16} /> {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <button className="btn small ghost" onClick={onCancel}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-box">
      <p>
        <strong>{email}</strong>: this email doesn’t match a current user… would you like to send this person an invite to join?
      </p>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary small" onClick={invite}>
          <Icon name="mail" size={16} /> Invite to join
        </button>
        <button className="btn small ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Add someone to a group by email (hosts and co-hosts). */
export default function AddMember({ group, onAdded }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const [notFound, setNotFound] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg({ error: '', ok: '' });
    setNotFound(null);
    try {
      const { member } = await api(`/groups/${group.id}/members`, { method: 'POST', body: { email } });
      setMsg({ error: '', ok: `${member.name} was added to the group.` });
      setEmail('');
      onAdded?.();
    } catch (err) {
      if (err.status === 404) setNotFound(email.trim().toLowerCase());
      else setMsg({ error: err.message, ok: '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="add-member">
      <form className="row" onSubmit={submit}>
        <input
          type="email"
          placeholder="Their email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address to add"
        />
        <button className="btn primary" disabled={busy}>
          <Icon name="plus" size={18} /> Add
        </button>
      </form>
      {msg.error && <div className="error">{msg.error}</div>}
      {msg.ok && <div className="success">{msg.ok}</div>}
      {notFound && (
        <InvitePrompt
          email={notFound}
          group={group}
          onDone={() => {
            setEmail('');
            onAdded?.();
          }}
          onCancel={() => setNotFound(null)}
        />
      )}
    </div>
  );
}

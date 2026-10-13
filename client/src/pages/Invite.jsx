import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDate } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import Cover from '../components/Cover.jsx';
import { ThemeToggle } from '../components/Layout.jsx';

/** Landing page for an invitation link: who invited you, to which book, and a big "join" button. */
export default function Invite() {
  const { token } = useParams();
  const { user, config, loading } = useApp();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/invites/${token}`)
      .then((d) => {
        // Already in the group (e.g. just signed up with this link): go straight there.
        if (d.invite.is_member) navigate(`/groups/${d.invite.group_id}`, { replace: true });
        else setInvite(d.invite);
      })
      .catch((e) => setError(e.message));
  }, [token, user, navigate]);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      const { group_id: groupId } = await api(`/invites/${token}/accept`, { method: 'POST' });
      navigate(`/groups/${groupId}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page invite-page">
      <div className="auth-theme">
        <ThemeToggle />
      </div>
      <div className="auth-card invite-card">
        <div className="auth-brand">
          <img src="/favicon.svg" alt="" width="40" height="40" />
          <div className="auth-brand-name">{config.appName}</div>
          {config.tagline && <div className="auth-tagline">{config.tagline}</div>}
        </div>
        {!invite && !error && <p className="muted center">Loading your invitation…</p>}
        {error && !invite && (
          <>
            <div className="error">{error}</div>
            <Link className="btn block" to="/">
              Go to the library
            </Link>
          </>
        )}
        {invite && (
          <>
            <div className="invite-cover">
              <Cover book={{ title: invite.book_title, author: invite.book_author, cover_url: invite.cover_url }} size="md" />
            </div>
            <p className="invite-lede">
              <strong>{invite.host_name}</strong> invited you to join a book group
            </p>
            <h1 className="invite-group">{invite.group_name}</h1>
            <p className="invite-book">
              Reading <em>{invite.book_title}</em>
              {invite.book_author ? ` by ${invite.book_author}` : ''}
            </p>
            <p className="muted small center">
              {invite.member_count} reader{invite.member_count === 1 ? '' : 's'} so far
              {invite.target_date ? ` · finishing by ${formatDate(invite.target_date)}` : ''}
            </p>
            {error && <div className="error">{error}</div>}
            {loading ? null : user ? (
              <button className="btn primary block big" onClick={join} disabled={busy}>
                {busy ? 'Joining…' : 'Join the group'}
              </button>
            ) : invite.has_account ? (
              <Link className="btn primary block big" to={`/login?invite=${token}`}>
                Log in to join
              </Link>
            ) : (
              <>
                <Link className="btn primary block big" to={`/signup?invite=${token}`}>
                  Create your account &amp; join
                </Link>
                <p className="auth-switch">
                  Already have an account? <Link to={`/login?invite=${token}`}>Log in to join</Link>
                </p>
              </>
            )}
            <p className="muted small center invite-about">
              Read Puritan classics side by side with clear modern English, follow a shared reading plan, and talk it over together.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

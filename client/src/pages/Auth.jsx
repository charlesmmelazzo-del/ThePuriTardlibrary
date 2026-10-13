import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import { ThemeToggle } from '../components/Layout.jsx';

function SupportLine() {
  const { config } = useApp();
  if (!config.supportEmail) return null;
  return (
    <p className="auth-help">
      Trouble logging in? Email{' '}
      <a href={`mailto:${config.supportEmail}?subject=${encodeURIComponent(`${config.appName} login help`)}`}>
        {config.supportEmail}
      </a>{' '}
      and we'll get you sorted out.
    </p>
  );
}

function AuthShell({ title, subtitle, children }) {
  const { config } = useApp();
  return (
    <div className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/favicon.svg" alt="" width="48" height="48" />
          <div className="auth-brand-name">{config.appName}</div>
          {config.tagline && <div className="auth-tagline">{config.tagline}</div>}
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
        <SupportLine />
      </div>
    </div>
  );
}

// Details of the invitation in ?invite=<token>, if any (to prefill the email and show the group).
function useInvite() {
  const [params] = useSearchParams();
  const token = params.get('invite');
  const [invite, setInvite] = useState(null);
  useEffect(() => {
    if (token) api(`/invites/${token}`).then((d) => setInvite(d.invite)).catch(() => {});
  }, [token]);
  return { token, invite };
}

function InviteBanner({ invite }) {
  if (!invite) return null;
  return (
    <div className="invite-banner">
      You’re joining <strong>{invite.group_name}</strong> to read <em>{invite.book_title}</em>, invited by {invite.host_name}.
    </div>
  );
}

function useAuthForm(endpoint) {
  const { signIn } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (body) => {
    setBusy(true);
    setError('');
    try {
      const { user, joined_group_id: groupId } = await api(endpoint, { method: 'POST', body });
      signIn(user);
      navigate(groupId ? `/groups/${groupId}` : location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return { error, busy, submit };
}

export function Login() {
  const { error, busy, submit } = useAuthForm('/auth/login');
  const { token, invite } = useInvite();
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (invite?.email) setEmail((e) => e || invite.email);
  }, [invite]);
  const [password, setPassword] = useState('');
  return (
    <AuthShell title="Welcome back" subtitle={invite ? 'Log in to join the group.' : 'Log in to pick up where you left off.'}>
      <InviteBanner invite={invite} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit({ email, password, invite: token || undefined });
        }}
      >
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="auth-switch">
        New here? <Link to={token ? `/signup?invite=${token}` : '/signup'}>Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function Signup() {
  const { error, busy, submit } = useAuthForm('/auth/signup');
  const { token, invite } = useInvite();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (invite?.email) setEmail((e) => e || invite.email);
  }, [invite]);
  const [password, setPassword] = useState('');
  return (
    <AuthShell
      title="Create your account"
      subtitle={
        invite
          ? 'Just add your name and a password, and you’ll be in the group.'
          : 'Read the Puritans in their own words, with a modern English rendering one swipe away.'
      }
    >
      <InviteBanner invite={invite} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit({ name, email, password, invite: token || undefined });
        }}
      >
        <label>
          Name{invite ? '' : <span className="muted"> (optional)</span>}
          <input autoComplete="name" required={Boolean(invite)} autoFocus={Boolean(invite)} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password <span className="muted">(at least 8 characters)</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to={token ? `/login?invite=${token}` : '/login'}>Log in</Link>
      </p>
    </AuthShell>
  );
}

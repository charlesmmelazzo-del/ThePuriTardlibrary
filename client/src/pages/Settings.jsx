import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';

export default function Settings() {
  const { user, config, theme, setTheme, updateMe, signOut } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(user.name || '');
  const [saved, setSaved] = useState('');
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pwMsg, setPwMsg] = useState({ error: '', ok: '' });

  const save = async (changes) => {
    await updateMe(changes);
    setSaved('Saved.');
    setTimeout(() => setSaved(''), 1500);
  };

  return (
    <div className="page narrow">
      <h1>Settings</h1>

      <section className="card">
        <h2>Reading</h2>
        <div className="setting">
          <div>
            <div className="setting-label">Appearance</div>
            <div className="muted small">Saved to your account, so it follows you to every device.</div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Appearance">
            {['light', 'dark'].map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'active' : ''} onClick={() => setTheme(t)}>
                <Icon name={t === 'dark' ? 'moon' : 'sun'} size={16} /> {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div>
            <div className="setting-label">Show paragraphs in</div>
            <div className="muted small">Which side of each card faces up when you open a book.</div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Default text">
            {[
              ['modern', 'Modern English'],
              ['original', 'Original'],
            ].map(([v, label]) => (
              <button key={v} role="radio" aria-checked={user.default_side === v} className={user.default_side === v ? 'active' : ''} onClick={() => save({ default_side: v })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div>
            <div className="setting-label">Text size</div>
            <div className="muted small" style={{ fontSize: user.font_size }}>
              The quick brown fox
            </div>
          </div>
          <input
            type="range"
            min="14"
            max="28"
            value={user.font_size}
            onChange={(e) => save({ font_size: Number(e.target.value) })}
            aria-label="Text size"
          />
        </div>
        {saved && <p className="muted small" role="status">{saved}</p>}
      </section>

      <section className="card">
        <h2>Account</h2>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            save({ name });
          }}
        >
          <label>
            Email
            <input value={user.email} disabled />
          </label>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn">Save name</button>
        </form>
      </section>

      <section className="card">
        <h2>Change password</h2>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwMsg({ error: '', ok: '' });
            try {
              await api('/auth/password', { method: 'POST', body: pw });
              setPw({ current_password: '', new_password: '' });
              setPwMsg({ error: '', ok: 'Password changed.' });
            } catch (err) {
              setPwMsg({ error: err.message, ok: '' });
            }
          }}
        >
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={pw.current_password}
              onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
            />
          </label>
          <label>
            New password <span className="muted">(at least 8 characters)</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={pw.new_password}
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
            />
          </label>
          {pwMsg.error && <div className="error">{pwMsg.error}</div>}
          {pwMsg.ok && <div className="success">{pwMsg.ok}</div>}
          <button className="btn">Change password</button>
        </form>
      </section>

      <section className="card">
        <h2>Help</h2>
        <p>
          Having trouble with your account? Email{' '}
          <a href={`mailto:${config.supportEmail}?subject=${encodeURIComponent(`${config.appName} help`)}`}>{config.supportEmail}</a>.
        </p>
        <div className="row">
          {user.is_admin && (
            <Link className="btn" to="/admin">
              <Icon name="shield" size={18} /> Admin panel
            </Link>
          )}
          <button
            className="btn"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            <Icon name="logout" size={18} /> Log out
          </button>
        </div>
      </section>
    </div>
  );
}

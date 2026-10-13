import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/auth.jsx';
import Icon from './Icon.jsx';

export function ThemeToggle() {
  const { theme, setTheme } = useApp();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button className="icon-btn" onClick={() => setTheme(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (location.pathname === '/search') setQ(params.get('q') || '');
  }, [location.pathname, params]);
  return (
    <form
      className="header-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Icon name="search" size={18} />
      <input
        type="search"
        placeholder="Search books & your notes"
        aria-label="Search books and your notes"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

export default function Layout() {
  const { user, config, signOut } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const reading = location.pathname.startsWith('/read/');

  const links = [
    { to: '/', label: 'Library', icon: 'library', end: true },
    { to: '/search', label: 'Search', icon: 'search', mobileOnly: true },
    { to: '/goals', label: 'Goals', icon: 'target' },
    { to: '/notes', label: 'Notes', icon: 'note' },
    ...(user.is_admin ? [{ to: '/admin', label: 'Admin', icon: 'shield' }] : []),
    { to: '/settings', label: 'Settings', icon: 'settings', mobileOnly: true },
  ];

  return (
    <div className={`app ${reading ? 'is-reading' : ''}`}>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>{config.appName}</span>
          </Link>
          <nav className="main-nav" aria-label="Main">
            {links
              .filter((l) => !l.mobileOnly)
              .map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end}>
                  {l.label}
                </NavLink>
              ))}
          </nav>
          <SearchBox />
          <div className="header-actions">
            <ThemeToggle />
            <NavLink to="/settings" className="icon-btn desktop-only" aria-label="Settings" title="Settings">
              <Icon name="user" />
            </NavLink>
            <button
              className="icon-btn desktop-only"
              aria-label="Log out"
              title="Log out"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <nav className="tab-bar" aria-label="Main">
        {links
          .filter((l) => l.to !== '/admin')
          .map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              <Icon name={l.icon} />
              <span>{l.label}</span>
            </NavLink>
          ))}
      </nav>
    </div>
  );
}

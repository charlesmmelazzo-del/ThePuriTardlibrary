import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AppContext = createContext(null);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17140f' : '#f6f1e7');
  try {
    localStorage.setItem('pl-theme', theme);
  } catch {
    /* storage unavailable */
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ appName: 'The Puritan Library', supportEmail: '' });
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState(() => document.documentElement.dataset.theme || 'light');

  useEffect(() => {
    Promise.all([api('/config').catch(() => null), api('/auth/me').catch(() => ({ user: null }))]).then(([cfg, me]) => {
      if (cfg) {
        setConfig(cfg);
        document.title = cfg.appName;
      }
      setUser(me.user);
      if (me.user?.theme) {
        setThemeState(me.user.theme);
        applyTheme(me.user.theme);
      }
      setLoading(false);
    });
  }, []);

  const signIn = useCallback((u) => {
    setUser(u);
    if (u?.theme) {
      setThemeState(u.theme);
      applyTheme(u.theme);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const updateMe = useCallback(async (changes) => {
    const { user: u } = await api('/auth/me', { method: 'PATCH', body: changes });
    setUser(u);
    return u;
  }, []);

  const setTheme = useCallback(
    (t) => {
      setThemeState(t);
      applyTheme(t);
      if (user) updateMe({ theme: t }).catch(() => {});
    },
    [user, updateMe],
  );

  return (
    <AppContext.Provider value={{ user, config, loading, theme, setTheme, signIn, signOut, updateMe }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

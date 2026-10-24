import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './auth';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'hive-theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#0e1411', light: '#f6f0e2' };

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

function storedTheme(): Theme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(value)) return value;
  } catch {
    // Storage can be blocked; fall through to the attribute set by index.html.
  }
  return isTheme(document.documentElement.dataset.theme)
    ? (document.documentElement.dataset.theme as Theme)
    : 'light';
}

function paint(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme]);
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const syncedUser = useRef<string | null>(null);

  useEffect(() => {
    paint(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Preferences still work for this page view.
    }
  }, [theme]);

  // The account preference wins once per sign-in. Local toggles update the
  // account too, so we must not re-apply a stale `user.theme` afterwards.
  useEffect(() => {
    if (!user) {
      syncedUser.current = null;
      return;
    }
    if (syncedUser.current === user.id) return;
    syncedUser.current = user.id;
    if (isTheme(user.theme)) setThemeState(user.theme);
  }, [user]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      if (user) {
        api.updatePreferences({ theme: next }).catch(() => undefined);
      }
    },
    [user],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<User>;
  register: (input: { username: string; email: string; password: string }) => Promise<{
    user: User;
    verificationSent: boolean;
  }>;
  playAsGuest: () => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.me();
      setUser(result.user);
      return result.user;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.error(error);
      }
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (loginName: string, password: string) => {
    const result = await api.login({ login: loginName, password });
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(
    async (input: { username: string; email: string; password: string }) => {
      const result = await api.register(input);
      setUser(result.user);
      return result;
    },
    [],
  );

  const playAsGuest = useCallback(async () => {
    const result = await api.guest();
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, playAsGuest, logout, refresh, setUser }),
    [user, loading, login, register, playAsGuest, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

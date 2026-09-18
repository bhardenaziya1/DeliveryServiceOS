import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@vendoros/shared';
import { AUTH_TOKEN_STORAGE_KEY } from '../../lib/apiClient';

const AUTH_USER_STORAGE_KEY = 'vendoros.user';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (accessToken: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  const login = useCallback((accessToken: string, nextUser: AuthUser) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken);
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

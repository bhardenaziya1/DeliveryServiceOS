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
import type {
  AuthSession,
  AuthTenant,
  AuthUser,
  CurrentUserResponse,
  Permission,
  RoleKey,
} from '@vendoros/shared';
import { api, setSessionExpiredHandler } from '../../lib/apiClient';
import { authStorage } from '../../lib/authStorage';

interface AuthContextValue {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  isAuthenticated: boolean;
  /** True until the stored session has been re-validated against the API. */
  isLoading: boolean;
  signIn: (session: AuthSession) => void;
  signOut: (options?: { allSessions?: boolean }) => Promise<void>;
  /** Re-reads `/auth/me`, e.g. after the user's own profile changes. */
  refreshCurrentUser: () => Promise<void>;
  hasPermission: (...permissions: Permission[]) => boolean;
  hasAnyPermission: (...permissions: Permission[]) => boolean;
  hasRole: (...roles: RoleKey[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = authStorage.read();
  const [user, setUser] = useState<AuthUser | null>(stored?.user ?? null);
  const [tenant, setTenant] = useState<AuthTenant | null>(stored?.tenant ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(stored !== null);

  const signIn = useCallback((session: AuthSession) => {
    authStorage.write({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
      tenant: session.tenant,
    });
    setUser(session.user);
    setTenant(session.tenant);
    setIsLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    authStorage.clear();
    setUser(null);
    setTenant(null);
    setIsLoading(false);
  }, []);

  const signOut = useCallback(
    async (options?: { allSessions?: boolean }) => {
      try {
        // Best effort: the server revokes the session, but a failure here must
        // not leave the user stuck in a UI they think they have left.
        await api.post('/auth/logout', {
          refreshToken: authStorage.getRefreshToken() ?? undefined,
          allSessions: options?.allSessions ?? false,
        });
      } catch {
        // Already expired or offline - clearing locally is still correct.
      } finally {
        clearSession();
      }
    },
    [clearSession],
  );

  const refreshCurrentUser = useCallback(async () => {
    const current = await api.get<CurrentUserResponse>('/auth/me');
    authStorage.writeIdentity(current.user, current.tenant);
    setUser(current.user);
    setTenant(current.tenant);
  }, []);

  // The API client cannot import this module (it would be a cycle), so the
  // "session is gone" callback is injected instead.
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
  }, [clearSession]);

  const hasRevalidated = useRef(false);

  /**
   * Re-reads the current user once on boot.
   *
   * The stored copy is only a cache: roles may have changed, or the session
   * may have been revoked, since this tab last ran. Trusting it without
   * checking would render a menu the server then refuses to serve.
   */
  useEffect(() => {
    if (hasRevalidated.current || !authStorage.getAccessToken()) {
      setIsLoading(false);
      return;
    }

    hasRevalidated.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const current = await api.get<CurrentUserResponse>('/auth/me');
        if (cancelled) return;
        authStorage.writeIdentity(current.user, current.tenant);
        setUser(current.user);
        setTenant(current.tenant);
      } catch {
        // The interceptor already tried to refresh; reaching here means the
        // session is unrecoverable.
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const permissions = useMemo(() => new Set<string>(user?.permissions ?? []), [user]);
  const roles = useMemo(() => new Set<string>(user?.roles ?? []), [user]);

  /** True only if the user holds every permission listed. */
  const hasPermission = useCallback(
    (...required: Permission[]) => required.every((permission) => permissions.has(permission)),
    [permissions],
  );

  /** True if the user holds at least one of the permissions listed. */
  const hasAnyPermission = useCallback(
    (...required: Permission[]) =>
      required.length === 0 || required.some((permission) => permissions.has(permission)),
    [permissions],
  );

  const hasRole = useCallback(
    (...required: RoleKey[]) => required.some((role) => roles.has(role)),
    [roles],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      tenant,
      isAuthenticated: user !== null,
      isLoading,
      signIn,
      signOut,
      refreshCurrentUser,
      hasPermission,
      hasAnyPermission,
      hasRole,
    }),
    [
      user,
      tenant,
      isLoading,
      signIn,
      signOut,
      refreshCurrentUser,
      hasPermission,
      hasAnyPermission,
      hasRole,
    ],
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

import type { AuthTenant, AuthUser } from '@vendoros/shared';

/**
 * Where the browser keeps its session.
 *
 * `localStorage` is a deliberate trade-off. The stronger option is an
 * httpOnly, SameSite cookie for the refresh token, which XSS cannot read - but
 * it needs a cookie-parsing, CSRF-token-issuing server and a same-site
 * deployment, none of which this split-origin SPA has yet. The mitigations
 * that *are* in place: access tokens live 15 minutes, refresh tokens are
 * single-use and rotate on every exchange, and replaying a spent one revokes
 * the whole session server-side (see `TokenService`). Moving to cookies later
 * only changes this file and the API's login handler.
 */
const ACCESS_TOKEN_KEY = 'vendoros.accessToken';
const REFRESH_TOKEN_KEY = 'vendoros.refreshToken';
const USER_KEY = 'vendoros.user';
const TENANT_KEY = 'vendoros.tenant';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  tenant: AuthTenant;
}

/** Storage throws in private mode and when site data is blocked. */
function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A session that cannot be persisted still works for this page view.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do - the values are already unreachable.
  }
}

function readJson<T>(key: string): T | null {
  const raw = safeRead(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or half-written value: treat it as no session at all.
    return null;
  }
}

export const authStorage = {
  getAccessToken: (): string | null => safeRead(ACCESS_TOKEN_KEY),
  getRefreshToken: (): string | null => safeRead(REFRESH_TOKEN_KEY),
  getUser: (): AuthUser | null => readJson<AuthUser>(USER_KEY),
  getTenant: (): AuthTenant | null => readJson<AuthTenant>(TENANT_KEY),

  read(): StoredSession | null {
    const accessToken = safeRead(ACCESS_TOKEN_KEY);
    const refreshToken = safeRead(REFRESH_TOKEN_KEY);
    const user = readJson<AuthUser>(USER_KEY);
    const tenant = readJson<AuthTenant>(TENANT_KEY);

    if (!accessToken || !refreshToken || !user || !tenant) return null;
    return { accessToken, refreshToken, user, tenant };
  },

  write(session: StoredSession): void {
    safeWrite(ACCESS_TOKEN_KEY, session.accessToken);
    safeWrite(REFRESH_TOKEN_KEY, session.refreshToken);
    safeWrite(USER_KEY, JSON.stringify(session.user));
    safeWrite(TENANT_KEY, JSON.stringify(session.tenant));
  },

  /** Updates just the tokens after a refresh, leaving the identity alone. */
  writeTokens(accessToken: string, refreshToken: string): void {
    safeWrite(ACCESS_TOKEN_KEY, accessToken);
    safeWrite(REFRESH_TOKEN_KEY, refreshToken);
  },

  writeIdentity(user: AuthUser, tenant: AuthTenant): void {
    safeWrite(USER_KEY, JSON.stringify(user));
    safeWrite(TENANT_KEY, JSON.stringify(tenant));
  },

  clear(): void {
    for (const key of [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, TENANT_KEY]) {
      safeRemove(key);
    }
  },
};

/** Exported for the API client, which must not import the whole module. */
export const AUTH_TOKEN_STORAGE_KEY = ACCESS_TOKEN_KEY;

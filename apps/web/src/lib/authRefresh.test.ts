import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import { apiClient, setSessionExpiredHandler } from './apiClient';
import { authStorage } from './authStorage';

/**
 * The response interceptor that recovers from an expired access token.
 *
 * The behaviour that matters most is the single-flight guarantee: refresh
 * tokens are single-use, so two parallel refreshes would rotate the same token
 * twice, the second would look like a replay, and the server would revoke the
 * session - signing the user out for loading two widgets at once.
 */
function unauthorized(url: string): AxiosError {
  const error = new AxiosError('Unauthorized');
  error.response = {
    status: 401,
    statusText: 'Unauthorized',
    data: {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' },
    },
    headers: {},
    config: { headers: {} } as never,
  };
  error.config = { url, headers: {} } as never;
  return error;
}

/** Drives the interceptor the way axios would on a rejected response. */
async function triggerInterceptor(error: AxiosError): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = (apiClient.interceptors.response as any).handlers as {
    rejected: (error: unknown) => Promise<unknown>;
  }[];
  const rejected = handlers.find((handler) => handler?.rejected)?.rejected;
  if (!rejected) throw new Error('No response interceptor is registered');
  return rejected(error);
}

function refreshResponse(suffix: string) {
  return {
    status: 200,
    data: {
      success: true,
      data: {
        accessToken: `access-${suffix}`,
        refreshToken: `refresh-${suffix}`,
        expiresIn: 900,
        tokenType: 'Bearer',
        sessionId: 'session-1',
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'user@tenant.ae',
          fullName: 'User',
          emailVerified: true,
          roles: [],
          permissions: [],
          lastLoginAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant' },
      },
      meta: { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z' },
    },
  };
}

describe('access-token refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    authStorage.writeTokens('expired-access', 'valid-refresh');
    setSessionExpiredHandler(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes once and replays the failed request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue(refreshResponse('1'));
    const replay = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue({ status: 200, data: { success: true, data: [], meta: {} } });

    await triggerInterceptor(unauthorized('/clients'));

    expect(post).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(authStorage.getAccessToken()).toBe('access-1');
  });

  it('rotates the stored refresh token too', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(refreshResponse('1'));
    vi.spyOn(apiClient, 'request').mockResolvedValue({ status: 200, data: {} });

    await triggerInterceptor(unauthorized('/clients'));

    expect(authStorage.getRefreshToken()).toBe('refresh-1');
  });

  it('shares one refresh between requests that fail together', async () => {
    let resolveRefresh: ((value: unknown) => void) | undefined;
    const post = vi.spyOn(axios, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    vi.spyOn(apiClient, 'request').mockResolvedValue({ status: 200, data: {} });

    const first = triggerInterceptor(unauthorized('/clients'));
    const second = triggerInterceptor(unauthorized('/projects'));

    resolveRefresh?.(refreshResponse('1'));
    await Promise.all([first, second]);

    // Two failures, one rotation - otherwise the second would be a replay and
    // the server would kill the session.
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh a failed login', async () => {
    const post = vi.spyOn(axios, 'post');

    await expect(triggerInterceptor(unauthorized('/auth/login'))).rejects.toBeDefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('does not try to refresh a failed refresh', async () => {
    const post = vi.spyOn(axios, 'post');

    await expect(triggerInterceptor(unauthorized('/auth/refresh'))).rejects.toBeDefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('retries a request only once', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue(refreshResponse('1'));
    const error = unauthorized('/clients');
    (error.config as { _retriedAfterRefresh?: boolean })._retriedAfterRefresh = true;

    await expect(triggerInterceptor(error)).rejects.toBeDefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('clears the session and notifies when the refresh is rejected', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh token revoked'));
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    await expect(triggerInterceptor(unauthorized('/clients'))).rejects.toBeDefined();

    expect(authStorage.getAccessToken()).toBeNull();
    expect(authStorage.getRefreshToken()).toBeNull();
    expect(onExpired).toHaveBeenCalled();
  });

  it('gives up immediately when there is no refresh token', async () => {
    authStorage.clear();
    const post = vi.spyOn(axios, 'post');
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    await expect(triggerInterceptor(unauthorized('/clients'))).rejects.toBeDefined();

    expect(post).not.toHaveBeenCalled();
    expect(onExpired).toHaveBeenCalled();
  });

  it('passes non-401 failures straight through', async () => {
    const error = unauthorized('/clients');
    error.response!.status = 500;
    const post = vi.spyOn(axios, 'post');

    await expect(triggerInterceptor(error)).rejects.toBe(error);
    expect(post).not.toHaveBeenCalled();
  });
});

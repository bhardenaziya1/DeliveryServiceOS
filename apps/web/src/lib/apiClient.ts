import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  looksLikeApiErrorResponse,
  type ApiResponse,
  type ApiErrorCode,
  type ApiFieldErrors,
  type AuthSession,
} from '@vendoros/shared';
import { env } from '../config/env';
import { authStorage, AUTH_TOKEN_STORAGE_KEY } from './authStorage';

export { AUTH_TOKEN_STORAGE_KEY };

/** Raw axios instance. Prefer the `api` helpers below, which unwrap the envelope. */
export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
});

apiClient.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Called when the session cannot be recovered, so the app can clear its state
 * and route to /login. Set once by `AuthProvider`.
 */
let onSessionExpired: (() => void) | undefined;

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

/** Endpoints where a 401 is the answer, not a signal to refresh. */
const NON_REFRESHABLE_PATHS = ['/auth/login', '/auth/refresh', '/auth/register'];

/**
 * The in-flight refresh, shared by every request that 401s while it runs.
 *
 * This matters more than it looks: refresh tokens are single-use, so two
 * parallel refreshes would rotate the same token twice, the second would be
 * rejected as a replay, and the server would revoke the session - logging the
 * user out for the crime of loading two widgets at once.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  // A bare axios call: going through `apiClient` would attach the expired
  // access token and re-enter this interceptor.
  const response = await axios.post<ApiResponse<AuthSession>>(`${env.apiBaseUrl}/auth/refresh`, {
    refreshToken,
  });

  const body = response.data;
  if (!body || body.success !== true) {
    throw new Error('Unexpected refresh response');
  }

  authStorage.writeTokens(body.data.accessToken, body.data.refreshToken);
  authStorage.writeIdentity(body.data.user, body.data.tenant);

  return body.data.accessToken;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retriedAfterRefresh?: boolean };

/**
 * Transparently recovers from an expired access token.
 *
 * Access tokens last 15 minutes, so this runs regularly in a long session.
 * One retry only: if the replayed request 401s again the session is genuinely
 * gone, and retrying further would loop.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const config = error.config as RetriableConfig | undefined;
    const url = config?.url ?? '';

    if (
      !config ||
      config._retriedAfterRefresh ||
      NON_REFRESHABLE_PATHS.some((p) => url.includes(p))
    ) {
      return Promise.reject(error);
    }

    if (!authStorage.getRefreshToken()) {
      onSessionExpired?.();
      return Promise.reject(error);
    }

    try {
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });

      const accessToken = await refreshInFlight;

      config._retriedAfterRefresh = true;
      config.headers.Authorization = `Bearer ${accessToken}`;
      return await apiClient.request(config);
    } catch {
      // The refresh token was expired, already spent, or its session was
      // revoked (including by the server's reuse detection).
      authStorage.clear();
      onSessionExpired?.();
      return Promise.reject(error);
    }
  },
);

/**
 * Every API response is `{ success, data, meta }` (see `@vendoros/shared`).
 * Callers want the payload, so unwrapping happens in exactly one place.
 */
function unwrap<T>(response: AxiosResponse<ApiResponse<T>>): T {
  // 204 No Content carries no envelope by design.
  if (response.status === 204) {
    return undefined as T;
  }

  const body = response.data;
  if (body && typeof body === 'object' && 'success' in body && body.success === true) {
    return body.data;
  }

  // Reached only if something between us and the API (proxy, CDN, tunnel)
  // replaced the body - worth surfacing loudly rather than rendering junk.
  throw new Error('Unexpected API response shape: missing success envelope');
}

export const api = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return unwrap(await apiClient.get<ApiResponse<T>>(url, config));
  },
  async post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return unwrap(await apiClient.post<ApiResponse<T>>(url, body, config));
  },
  async put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return unwrap(await apiClient.put<ApiResponse<T>>(url, body, config));
  },
  async patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return unwrap(await apiClient.patch<ApiResponse<T>>(url, body, config));
  },
  async delete(url: string, config?: AxiosRequestConfig): Promise<void> {
    await apiClient.delete(url, config);
  },
};

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/** The error envelope carried by a rejected request, when there is one. */
function errorBody(error: unknown) {
  if (axios.isAxiosError(error) && looksLikeApiErrorResponse(error.response?.data)) {
    return error.response.data;
  }
  return undefined;
}

/** A message safe to render in a toast or form-level alert. */
export function extractApiErrorMessage(error: unknown): string {
  const body = errorBody(error);
  if (!body) {
    return axios.isAxiosError(error) && error.code === 'ERR_NETWORK'
      ? 'Cannot reach the server. Check your connection and try again.'
      : FALLBACK_MESSAGE;
  }

  const firstFieldError = Object.values(body.error.fieldErrors ?? {})
    .flat()
    .find(Boolean);

  return firstFieldError ?? body.error.message ?? FALLBACK_MESSAGE;
}

/** Per-field messages, for mapping server validation back onto a form. */
export function extractApiFieldErrors(error: unknown): ApiFieldErrors {
  return errorBody(error)?.error.fieldErrors ?? {};
}

/** Stable error code, for branching (e.g. sign the user out on UNAUTHORIZED). */
export function extractApiErrorCode(error: unknown): ApiErrorCode | undefined {
  return errorBody(error)?.error.code;
}

/** Correlation id to quote in a bug report. */
export function extractApiRequestId(error: unknown): string | undefined {
  return errorBody(error)?.meta.requestId;
}

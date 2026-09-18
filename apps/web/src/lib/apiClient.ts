import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import {
  looksLikeApiErrorResponse,
  type ApiErrorCode,
  type ApiFieldErrors,
  type ApiResponse,
} from '@vendoros/shared';
import { env } from '../config/env';

export const AUTH_TOKEN_STORAGE_KEY = 'vendoros.accessToken';

/** Raw axios instance. Prefer the `api` helpers below, which unwrap the envelope. */
export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

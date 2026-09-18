import { type ApiErrorCode } from './error-codes';

/**
 * Every VendorOS API response - success or failure - is one of these two shapes.
 * Handlers return their payload; the API's response interceptor and exception
 * filter are the only places that build the envelope.
 */

export interface ApiResponseMeta {
  /** Correlates the response with server logs; echoed in the `x-request-id` header. */
  requestId: string;
  /** ISO-8601 timestamp of when the response was serialised. */
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ApiResponseMeta;
}

/** Per-field validation messages, keyed by dotted field path. */
export type ApiFieldErrors = Record<string, string[]>;

export interface ApiErrorPayload {
  code: ApiErrorCode;
  /** Human-readable, safe to show to an end user. */
  message: string;
  /** Present only for validation failures. */
  fieldErrors?: ApiFieldErrors;
  /** Extra machine-readable context (e.g. which dependency is down). Never contains secrets. */
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
  meta: ApiResponseMeta & {
    /** Request path that produced the error. */
    path: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function isApiSuccessResponse<T>(value: ApiResponse<T>): value is ApiSuccessResponse<T> {
  return value.success === true;
}

export function isApiErrorResponse<T>(value: ApiResponse<T>): value is ApiErrorResponse {
  return value.success === false;
}

/**
 * Narrow an unknown body (e.g. an axios error payload) to the error envelope.
 * Deliberately structural: a proxy or load balancer can return something else.
 */
export function looksLikeApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ApiErrorResponse>;
  return (
    candidate.success === false &&
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof candidate.error.message === 'string'
  );
}

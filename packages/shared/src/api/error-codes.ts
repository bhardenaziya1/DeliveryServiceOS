/**
 * Stable, machine-readable error codes returned in the API error envelope.
 *
 * Clients branch on `code`, never on `message` (which is human-facing and may
 * be reworded or localised at any time) and never on the HTTP status alone.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Default HTTP status for each error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** Reverse mapping used when only an HTTP status is known (e.g. a raw HttpException). */
export function apiErrorCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'DEPENDENCY_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
  }
}

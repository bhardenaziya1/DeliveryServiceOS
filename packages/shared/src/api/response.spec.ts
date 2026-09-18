import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, API_ERROR_STATUS, apiErrorCodeForStatus } from './error-codes';
import {
  isApiErrorResponse,
  isApiSuccessResponse,
  looksLikeApiErrorResponse,
  type ApiErrorResponse,
  type ApiSuccessResponse,
} from './response';

const meta = { requestId: 'req-1', timestamp: '2026-01-01T00:00:00.000Z' };

const success: ApiSuccessResponse<{ id: string }> = {
  success: true,
  data: { id: 'client-1' },
  meta,
};

const failure: ApiErrorResponse = {
  success: false,
  error: { code: 'NOT_FOUND', message: 'Client not found' },
  meta: { ...meta, path: '/api/v1/clients/x' },
};

describe('error codes', () => {
  it('maps every code to a status', () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('maps statuses back to codes', () => {
    expect(apiErrorCodeForStatus(404)).toBe('NOT_FOUND');
    expect(apiErrorCodeForStatus(409)).toBe('CONFLICT');
    expect(apiErrorCodeForStatus(418)).toBe('VALIDATION_ERROR');
    expect(apiErrorCodeForStatus(502)).toBe('INTERNAL_ERROR');
  });
});

describe('envelope guards', () => {
  it('discriminates success from failure', () => {
    expect(isApiSuccessResponse(success)).toBe(true);
    expect(isApiErrorResponse(failure)).toBe(true);
    expect(isApiSuccessResponse(failure)).toBe(false);
  });

  it('structurally detects an error envelope', () => {
    expect(looksLikeApiErrorResponse(failure)).toBe(true);
    expect(looksLikeApiErrorResponse(success)).toBe(false);
    expect(looksLikeApiErrorResponse(null)).toBe(false);
    expect(looksLikeApiErrorResponse('<html>502</html>')).toBe(false);
    expect(looksLikeApiErrorResponse({ success: false })).toBe(false);
  });
});

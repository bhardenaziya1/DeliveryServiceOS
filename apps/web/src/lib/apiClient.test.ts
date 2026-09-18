import { describe, expect, it, vi } from 'vitest';
import {
  api,
  apiClient,
  extractApiErrorCode,
  extractApiErrorMessage,
  extractApiFieldErrors,
  extractApiRequestId,
} from './apiClient';

const meta = { requestId: 'req-42', timestamp: '2026-01-01T00:00:00.000Z' };

function axiosError(data: unknown, code?: string) {
  return { isAxiosError: true, code, response: { data } };
}

describe('api helpers', () => {
  it('unwraps the success envelope', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: { id: 'client-1' }, meta },
    });

    await expect(api.get<{ id: string }>('/clients/client-1')).resolves.toEqual({
      id: 'client-1',
    });
  });

  it('returns undefined for 204 responses', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ status: 204, data: '' });

    await expect(api.get('/clients/client-1')).resolves.toBeUndefined();
  });

  it('throws when the envelope is missing', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ status: 200, data: { id: 'raw' } });

    await expect(api.get('/clients')).rejects.toThrow(/success envelope/i);
  });
});

describe('extractApiErrorMessage', () => {
  it('prefers the first field error', () => {
    const error = axiosError({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fieldErrors: { legalName: ['Legal name is required'] },
      },
      meta: { ...meta, path: '/api/v1/clients' },
    });

    expect(extractApiErrorMessage(error)).toBe('Legal name is required');
  });

  it('falls back to the envelope message', () => {
    const error = axiosError({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Client not found' },
      meta: { ...meta, path: '/api/v1/clients/x' },
    });

    expect(extractApiErrorMessage(error)).toBe('Client not found');
    expect(extractApiErrorCode(error)).toBe('NOT_FOUND');
    expect(extractApiRequestId(error)).toBe('req-42');
  });

  it('reports network failures distinctly', () => {
    expect(extractApiErrorMessage(axiosError(undefined, 'ERR_NETWORK'))).toMatch(
      /cannot reach the server/i,
    );
  });

  it('never leaks a non-envelope body', () => {
    expect(extractApiErrorMessage(axiosError('<html>502 Bad Gateway</html>'))).toMatch(
      /something went wrong/i,
    );
    expect(extractApiFieldErrors(axiosError('<html>502</html>'))).toEqual({});
  });
});

import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Resolves the correlation id for a request.
 *
 * `pino-http` assigns `req.id` for us in the running app; the fallbacks keep
 * the envelope and logs correlated in unit/e2e tests that bootstrap Nest
 * without the logger module.
 */
export function resolveRequestId(req: IncomingMessage & { id?: unknown }): string {
  if (typeof req.id === 'string' && req.id.length > 0) {
    return req.id;
  }

  const header = req.headers?.[REQUEST_ID_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (typeof fromHeader === 'string' && fromHeader.trim().length > 0) {
    return fromHeader.trim();
  }

  const generated = randomUUID();
  req.id = generated;
  return generated;
}

/** Echoes the correlation id back so clients can quote it in bug reports. */
export function setRequestIdHeader(res: ServerResponse, requestId: string): void {
  if (!res.headersSent) {
    res.setHeader(REQUEST_ID_HEADER, requestId);
  }
}

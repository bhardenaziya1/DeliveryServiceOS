import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { resolveRequestId } from '../http/request-id';
import type { AuditRequestContext } from '../audit/audit.service';

/**
 * Where the request came from, for the audit trail.
 *
 * "Who signed in, from which address, on which device" is the first thing a
 * compliance review asks about an authentication event, so every auth handler
 * takes this and passes it through to `AuditService`.
 */
export const RequestContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditRequestContext => {
    const request = ctx.switchToHttp().getRequest<Request>();

    return {
      // `app.set('trust proxy')` decides whether `req.ip` honours
      // X-Forwarded-For; see main.ts, where it is enabled for the managed
      // platforms VendorOS deploys to.
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: request.get?.('user-agent') ?? null,
      requestId: resolveRequestId(request),
    };
  },
);

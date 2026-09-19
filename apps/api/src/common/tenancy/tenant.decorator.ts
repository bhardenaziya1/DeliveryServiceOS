import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { TenantContext } from './tenant-context.guard';

/**
 * The authenticated tenant id.
 *
 * Reads `request.tenantContext`, which `TenantContextGuard` derives from the
 * verified access token. A handler therefore cannot accidentally bind a tenant
 * id from the body or query string - there is no parameter shape that would
 * let it.
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ tenantContext?: TenantContext }>();
  const tenantId = request.tenantContext?.tenantId;

  if (!tenantId) {
    // Only reachable if a route bypassed the guard chain - a wiring bug.
    throw new InternalServerErrorException('Tenant context is not available on this request');
  }

  return tenantId;
});

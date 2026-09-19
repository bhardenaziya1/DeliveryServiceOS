import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { PUBLIC_KEY } from '../rbac/rbac.decorators';
import { AppException } from '../errors/app.exception';
import type { RequestUser } from '../types/request-user';

/** Keys a client might use to try to nominate a tenant. */
const TENANT_KEYS = ['tenantId', 'tenant_id', 'tenantID'] as const;
const TENANT_HEADERS = ['x-tenant-id', 'x-tenant'] as const;

export interface TenantContext {
  tenantId: string;
  userId: string;
}

interface TenantAwareRequest {
  user?: RequestUser;
  body?: unknown;
  query?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  tenantContext?: TenantContext;
  method?: string;
  url?: string;
}

/**
 * Establishes the tenant for the request, and makes sure nothing else can.
 *
 * Two jobs:
 *
 * 1. Publish `request.tenantContext` from the authenticated user, so handlers
 *    and services read the tenant from one obvious place.
 * 2. Strip any tenant identifier the client sent. The Zod schemas already drop
 *    unknown keys, so this is defence in depth - but it is the layer that
 *    holds if a future endpoint takes a loosely-typed body, and it turns a
 *    silent no-op into a logged warning that surfaces the attempt.
 *
 * A *mismatching* tenant id is rejected outright rather than stripped: a
 * client echoing back its own tenant id is a harmless habit, but one naming a
 * different tenant is either a bug worth failing loudly on or an attack worth
 * refusing.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TenantContextGuard.name);
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<TenantAwareRequest>();
    const user = request.user;

    if (isPublic || !user) {
      // Nothing is authenticated yet, so there is no tenant to establish and
      // nothing downstream that could act on a supplied one.
      return true;
    }

    const supplied = [
      ...this.collect(request.body),
      ...this.collect(request.query),
      ...this.collect(request.params),
      ...TENANT_HEADERS.map((header) => request.headers?.[header]).filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      ),
    ];

    const conflicting = supplied.filter((value) => value !== user.tenantId);

    if (conflicting.length > 0) {
      this.logger.warn(
        {
          authenticatedTenantId: user.tenantId,
          suppliedTenantId: conflicting[0],
          userId: user.id,
          method: request.method,
          url: request.url,
        },
        'Request supplied a tenant id that does not match the authenticated tenant',
      );
      throw AppException.forbidden('Tenant context cannot be set by the client');
    }

    this.scrub(request.body);
    this.scrub(request.query);

    request.tenantContext = { tenantId: user.tenantId, userId: user.id };
    return true;
  }

  /** Tenant ids present anywhere in a request container, at the top level. */
  private collect(container: unknown): string[] {
    if (container === null || typeof container !== 'object') return [];
    const record = container as Record<string, unknown>;
    return TENANT_KEYS.map((key) => record[key]).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  }

  /**
   * Removes tenant keys so no downstream code can read one by accident.
   *
   * Express's `query` is a getter on newer versions, so the delete is
   * best-effort; the mismatch check above is what actually enforces the rule.
   */
  private scrub(container: unknown): void {
    if (container === null || typeof container !== 'object') return;
    const record = container as Record<string, unknown>;
    for (const key of TENANT_KEYS) {
      if (key in record) {
        try {
          delete record[key];
        } catch {
          record[key] = undefined;
        }
      }
    }
  }
}

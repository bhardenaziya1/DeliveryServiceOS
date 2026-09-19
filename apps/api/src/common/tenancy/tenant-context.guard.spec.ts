import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALL_PERMISSIONS, ROLES } from '@vendoros/shared';
import { TenantContextGuard } from './tenant-context.guard';
import { AppException } from '../errors/app.exception';
import type { RequestUser } from '../types/request-user';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const user: RequestUser = {
  id: 'user-1',
  tenantId: TENANT_A,
  email: 'owner@tenant-a.ae',
  fullName: 'Tenant A Owner',
  emailVerified: true,
  roles: [ROLES.SUPER_ADMIN],
  permissions: [...ALL_PERMISSIONS],
  sessionId: 'session-1',
};

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('TenantContextGuard', () => {
  let guard: TenantContextGuard;
  let logger: { setContext: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    logger = { setContext: jest.fn(), warn: jest.fn() };
    guard = new TenantContextGuard(new Reflector(), logger as never);
  });

  it('publishes the tenant from the authenticated user', () => {
    const request: Record<string, unknown> = { user, body: {}, query: {}, headers: {} };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request['tenantContext']).toEqual({ tenantId: TENANT_A, userId: user.id });
  });

  it('strips a tenant id the client echoed back in the body', () => {
    const body: Record<string, unknown> = { tenantId: TENANT_A, legalName: 'Acme' };
    const request = { user, body, query: {}, headers: {} };

    guard.canActivate(contextFor(request));

    expect(body).not.toHaveProperty('tenantId');
    expect(body['legalName']).toBe('Acme');
  });

  it.each([
    ['body', (value: string) => ({ body: { tenantId: value }, query: {}, headers: {} })],
    ['query', (value: string) => ({ body: {}, query: { tenantId: value }, headers: {} })],
    [
      'snake_case body key',
      (value: string) => ({ body: { tenant_id: value }, query: {}, headers: {} }),
    ],
    [
      'x-tenant-id header',
      (value: string) => ({ body: {}, query: {}, headers: { 'x-tenant-id': value } }),
    ],
  ])('refuses a mismatched tenant id supplied via the %s', (_label, build) => {
    const request = { user, ...build(TENANT_B) };

    expect(() => guard.canActivate(contextFor(request))).toThrow(AppException);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ authenticatedTenantId: TENANT_A, suppliedTenantId: TENANT_B }),
      expect.any(String),
    );
  });

  it('rejects with FORBIDDEN rather than silently using the caller tenant', () => {
    const request = { user, body: { tenantId: TENANT_B }, query: {}, headers: {} };

    try {
      guard.canActivate(contextFor(request));
      throw new Error('expected the guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('FORBIDDEN');
    }
  });

  it('leaves unauthenticated requests alone', () => {
    // Nothing downstream can act on a tenant yet, and login/register bodies
    // must not be rejected for mentioning a tenant name.
    const request: Record<string, unknown> = {
      body: { tenantId: TENANT_B },
      query: {},
      headers: {},
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request['tenantContext']).toBeUndefined();
  });
});

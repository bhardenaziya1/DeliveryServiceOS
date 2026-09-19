import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS, ROLES, permissionsForRoles } from '@vendoros/shared';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY, PUBLIC_KEY, ROLES_KEY } from './rbac.decorators';
import { AppException } from '../errors/app.exception';
import type { RequestUser } from '../types/request-user';

function userWithRoles(...roles: (typeof ROLES)[keyof typeof ROLES][]): RequestUser {
  return {
    id: 'user-1',
    tenantId: 'tenant-a',
    email: 'user@tenant-a.ae',
    fullName: 'Test User',
    emailVerified: true,
    roles,
    permissions: permissionsForRoles(roles),
    sessionId: 'session-1',
  };
}

function contextFor(user?: RequestUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  /** Stubs the decorator metadata a route would carry. */
  function route(metadata: Record<string, unknown>) {
    reflector.getAllAndOverride.mockImplementation((key: string) => metadata[key]);
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows a route with no requirements', () => {
    route({});
    expect(guard.canActivate(contextFor(userWithRoles(ROLES.VIEWER)))).toBe(true);
  });

  it('allows a public route without a user', () => {
    route({ [PUBLIC_KEY]: true });
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('rejects a protected route reached without a user', () => {
    route({ [PERMISSIONS_KEY]: [PERMISSIONS.CLIENTS_READ] });

    try {
      guard.canActivate(contextFor(undefined));
      throw new Error('expected the guard to throw');
    } catch (error) {
      expect((error as AppException).code).toBe('UNAUTHORIZED');
    }
  });

  it('allows a user holding the required permission', () => {
    route({ [PERMISSIONS_KEY]: [PERMISSIONS.CLIENTS_READ] });
    expect(guard.canActivate(contextFor(userWithRoles(ROLES.VIEWER)))).toBe(true);
  });

  it('rejects a user missing the required permission', () => {
    route({ [PERMISSIONS_KEY]: [PERMISSIONS.CLIENTS_DELETE] });

    try {
      guard.canActivate(contextFor(userWithRoles(ROLES.VIEWER)));
      throw new Error('expected the guard to throw');
    } catch (error) {
      expect((error as AppException).code).toBe('FORBIDDEN');
    }
  });

  it('requires every listed permission, not just one', () => {
    // An Accountant can manage invoices but not payroll.
    route({ [PERMISSIONS_KEY]: [PERMISSIONS.INVOICES_MANAGE, PERMISSIONS.PAYROLL_MANAGE] });

    expect(() => guard.canActivate(contextFor(userWithRoles(ROLES.ACCOUNTANT)))).toThrow(
      AppException,
    );
  });

  it('accepts any one of several allowed roles', () => {
    route({ [ROLES_KEY]: [ROLES.SUPER_ADMIN, ROLES.ADMIN] });

    expect(guard.canActivate(contextFor(userWithRoles(ROLES.ADMIN)))).toBe(true);
    expect(() => guard.canActivate(contextFor(userWithRoles(ROLES.VIEWER)))).toThrow(AppException);
  });

  it('holds a user to both the permission and the role requirement', () => {
    route({
      [PERMISSIONS_KEY]: [PERMISSIONS.CLIENTS_READ],
      [ROLES_KEY]: [ROLES.SUPER_ADMIN],
    });

    // Has the permission, wrong role.
    expect(() => guard.canActivate(contextFor(userWithRoles(ROLES.VIEWER)))).toThrow(AppException);
    expect(guard.canActivate(contextFor(userWithRoles(ROLES.SUPER_ADMIN)))).toBe(true);
  });
});

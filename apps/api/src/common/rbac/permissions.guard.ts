import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission, RoleKey } from '@vendoros/shared';
import { AppException } from '../errors/app.exception';
import { PERMISSIONS_KEY, PUBLIC_KEY, ROLES_KEY } from './rbac.decorators';
import type { RequestUser } from '../types/request-user';

/**
 * Enforces `@RequirePermissions` / `@RequireRoles` against the authenticated
 * user's resolved permission set.
 *
 * Registered globally after `JwtAuthGuard`, so it can rely on `request.user`
 * already being populated from a verified token.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const requiredRoles =
      this.reflector.getAllAndOverride<RoleKey[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0 && requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (!user) {
      // A non-public route reached this guard without a user: the auth guard
      // did not run. Fail closed rather than assuming it was allowed.
      throw AppException.unauthorized();
    }

    const missing = requiredPermissions.filter(
      (permission) => !user.permissions.includes(permission),
    );

    if (missing.length > 0) {
      throw AppException.forbidden('You do not have permission to perform this action');
    }

    if (requiredRoles.length > 0 && !requiredRoles.some((role) => user.roles.includes(role))) {
      throw AppException.forbidden('You do not have permission to perform this action');
    }

    return true;
  }
}

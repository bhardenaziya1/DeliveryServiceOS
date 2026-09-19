import { SetMetadata } from '@nestjs/common';
import type { Permission, RoleKey } from '@vendoros/shared';

export const PUBLIC_KEY = 'auth:public';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ROLES_KEY = 'auth:roles';

/**
 * Opts a route out of authentication.
 *
 * Authentication is global (see `APP_GUARD` in `AppModule`), so a new endpoint
 * is protected unless it says otherwise. Forgetting a guard can no longer
 * expose data; forgetting `@Public()` merely makes a public route 401, which
 * is noticed immediately.
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Requires every listed permission (AND, not OR).
 *
 * Authorisation is expressed in permissions rather than role names so that
 * re-scoping a role is a seed change, not a code change.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Requires at least one of the listed roles.
 *
 * Reserved for the rare check that is genuinely about *who someone is* rather
 * than what they may do. Prefer `@RequirePermissions`.
 */
export const RequireRoles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);

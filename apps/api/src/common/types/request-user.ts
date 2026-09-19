import type { Permission, RoleKey } from '@vendoros/shared';

/**
 * Everything a request knows about its caller.
 *
 * Built by `JwtStrategy` from the verified access token plus a fresh database
 * read - never from the request body, query string or headers. `tenantId` in
 * particular is the authenticated tenant and is the only tenant any handler
 * may touch.
 */
export interface RequestUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  roles: RoleKey[];
  permissions: Permission[];
  /** The session this access token was issued under. */
  sessionId: string;
}

export function userHasPermission(user: RequestUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  permissionsForRoles,
  isRoleKey,
  type AuthTenant,
  type AuthUser,
  type Permission,
  type RoleKey,
} from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../common/types/request-user';

/** The shape every caller needs: the user, their roles and their tenant. */
const USER_WITH_ROLES = {
  include: {
    tenant: true,
    roles: { include: { role: true } },
  },
} satisfies Prisma.UserDefaultArgs;

export type UserWithRoles = Prisma.UserGetPayload<typeof USER_WITH_ROLES>;

/**
 * Resolves a stored user into the role/permission view the rest of the app
 * uses.
 *
 * Permissions are derived from the role definitions in `@vendoros/shared`
 * rather than re-read from `role_permissions` on every request: the seed keeps
 * the table in step with those definitions, and this keeps authorisation to a
 * single query per request instead of a three-table join.
 */
@Injectable()
export class UserContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a user by id within a known tenant.
   *
   * Both ids come from the verified access token, and both are applied - so a
   * token whose `sub` and `tenantId` have been tampered into disagreement
   * matches nothing.
   */
  async findById(userId: string, tenantId: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      ...USER_WITH_ROLES,
    });
  }

  /**
   * Loads a user by email across all tenants.
   *
   * Unscoped by necessity: at login the email is the only thing known, and
   * establishing which tenant it belongs to is the point of the query. Email is
   * globally unique, so this resolves to at most one account.
   */
  async findByEmailForAuthentication(email: string): Promise<UserWithRoles | null> {
    return this.prisma.unscoped(() =>
      this.prisma.user.findUnique({ where: { email }, ...USER_WITH_ROLES }),
    );
  }

  static roleKeys(user: UserWithRoles): RoleKey[] {
    return user.roles.map((assignment) => assignment.role.key).filter(isRoleKey);
  }

  static permissions(user: UserWithRoles): Permission[] {
    return permissionsForRoles(UserContextService.roleKeys(user));
  }

  /** The per-request identity, for guards, decorators and services. */
  static toRequestUser(user: UserWithRoles, sessionId: string): RequestUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerifiedAt !== null,
      roles: UserContextService.roleKeys(user),
      permissions: UserContextService.permissions(user),
      sessionId,
    };
  }

  /** The user as the browser sees it. Never includes the password hash. */
  static toAuthUser(user: UserWithRoles): AuthUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerifiedAt !== null,
      roles: UserContextService.roleKeys(user),
      permissions: UserContextService.permissions(user),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  static toAuthTenant(user: UserWithRoles): AuthTenant {
    return { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug };
  }
}

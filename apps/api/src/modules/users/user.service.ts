import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, UserStatus } from '@prisma/client';
import {
  canManageRole,
  highestRank,
  isRoleKey,
  ROLES,
  type AssignRolesInput,
  type PaginatedResult,
  type PaginationQuery,
  type UpdateProfileInput,
  type UpdateUserInput,
  type UserDto,
} from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { AuditService, type AuditRequestContext } from '../../common/audit/audit.service';
import { buildPaginatedResult } from '../../common/pagination/paginate';
import type { RequestUser } from '../../common/types/request-user';
import { TokenService } from '../auth/token.service';

const USER_WITH_ROLES = {
  include: { roles: { include: { role: true } } },
} satisfies Prisma.UserDefaultArgs;

type UserRecord = Prisma.UserGetPayload<typeof USER_WITH_ROLES>;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tokenService: TokenService,
  ) {}

  async list(tenantId: string, query: PaginationQuery): Promise<PaginatedResult<UserDto>> {
    const where: Prisma.UserWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortableFields = new Set(['fullName', 'email', 'status', 'createdAt', 'lastLoginAt']);
    const orderBy: Prisma.UserOrderByWithRelationInput =
      query.sortBy && sortableFields.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        ...USER_WITH_ROLES,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResult(items.map(toUserDto), total, query);
  }

  async findOne(tenantId: string, id: string): Promise<UserDto> {
    return toUserDto(await this.requireUser(tenantId, id));
  }

  /** The signed-in user editing their own profile. No permission required. */
  async updateOwnProfile(
    actor: RequestUser,
    input: UpdateProfileInput,
    context?: AuditRequestContext,
  ): Promise<UserDto> {
    const before = await this.requireUser(actor.tenantId, actor.id);

    const updated = await this.prisma.user.update({
      where: { id: actor.id, tenantId: actor.tenantId },
      data: { fullName: input.fullName },
      ...USER_WITH_ROLES,
    });

    await this.auditService.recordForUser(actor, {
      entityType: 'User',
      entityId: actor.id,
      action: AuditAction.USER_UPDATED,
      before: { fullName: before.fullName },
      after: { fullName: updated.fullName },
      ...context,
    });

    return toUserDto(updated);
  }

  /**
   * Administrative update of another user in the same tenant.
   *
   * Disabling a user revokes their sessions immediately rather than letting
   * them keep working until their access token happens to expire.
   */
  async update(
    actor: RequestUser,
    id: string,
    input: UpdateUserInput,
    context?: AuditRequestContext,
  ): Promise<UserDto> {
    const existing = await this.requireUser(actor.tenantId, id);

    if (input.status === UserStatus.DISABLED) {
      this.assertNotSelf(actor, id, 'You cannot disable your own account');
      this.assertOutranks(actor, existing, 'You cannot disable a user with a higher role');
      await this.assertNotLastSuperAdmin(actor.tenantId, existing);
    }

    const updated = await this.prisma.user.update({
      where: { id: existing.id, tenantId: actor.tenantId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      ...USER_WITH_ROLES,
    });

    if (input.status === UserStatus.DISABLED) {
      await this.tokenService.revokeAllUserSessions(existing.id, actor.tenantId, 'user_disabled');
    }

    await this.auditService.recordForUser(actor, {
      entityType: 'User',
      entityId: existing.id,
      action:
        input.status === UserStatus.DISABLED ? AuditAction.USER_DISABLED : AuditAction.USER_UPDATED,
      before: { fullName: existing.fullName, status: existing.status },
      after: { fullName: updated.fullName, status: updated.status },
      ...context,
    });

    return toUserDto(updated);
  }

  /**
   * Replaces a user's roles with exactly the set given.
   *
   * Three rules, each of which exists to close a privilege-escalation path:
   *
   * - you cannot change your own roles (no self-promotion);
   * - you cannot grant or revoke a role ranked above your own;
   * - the last Super Admin cannot be demoted, or the tenant locks itself out.
   *
   * Every session the target holds is revoked, so a demotion takes effect at
   * once instead of lingering for the life of an access token.
   */
  async assignRoles(
    actor: RequestUser,
    id: string,
    input: AssignRolesInput,
    context?: AuditRequestContext,
  ): Promise<UserDto> {
    const target = await this.requireUser(actor.tenantId, id);

    this.assertNotSelf(actor, id, 'You cannot change your own roles');
    this.assertOutranks(actor, target, 'You cannot change the roles of a more privileged user');

    const forbidden = input.roleKeys.filter((role) => !canManageRole(actor.roles, role));
    if (forbidden.length > 0) {
      throw AppException.forbidden(
        `You cannot grant a role more privileged than your own: ${forbidden.join(', ')}`,
      );
    }

    const previousRoles = roleKeysOf(target);
    const losingSuperAdmin =
      previousRoles.includes(ROLES.SUPER_ADMIN) && !input.roleKeys.includes(ROLES.SUPER_ADMIN);

    if (losingSuperAdmin) {
      await this.assertNotLastSuperAdmin(actor.tenantId, target);
    }

    const roles = await this.prisma.role.findMany({ where: { key: { in: input.roleKeys } } });
    if (roles.length !== new Set(input.roleKeys).size) {
      throw AppException.validation('One or more roles are unknown');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { userId: id, tenantId: actor.tenantId } });
      await tx.userRoleAssignment.createMany({
        data: roles.map((role) => ({
          tenantId: actor.tenantId,
          userId: id,
          roleId: role.id,
          assignedById: actor.id,
        })),
      });

      return tx.user.findFirstOrThrow({
        where: { id, tenantId: actor.tenantId },
        ...USER_WITH_ROLES,
      });
    });

    await this.tokenService.revokeAllUserSessions(id, actor.tenantId, 'roles_changed');

    await this.auditService.recordForUser(actor, {
      entityType: 'User',
      entityId: id,
      action: AuditAction.ROLES_CHANGED,
      before: { roles: previousRoles },
      after: { roles: roleKeysOf(updated) },
      ...context,
    });

    return toUserDto(updated);
  }

  /** Administratively ends every session a user holds. */
  async revokeSessions(
    actor: RequestUser,
    id: string,
    context?: AuditRequestContext,
  ): Promise<{ revokedSessions: number }> {
    const target = await this.requireUser(actor.tenantId, id);
    this.assertOutranks(actor, target, 'You cannot revoke sessions for a more privileged user');

    const revoked = await this.tokenService.revokeAllUserSessions(
      target.id,
      actor.tenantId,
      'revoked_by_admin',
    );

    await this.auditService.recordForUser(actor, {
      entityType: 'User',
      entityId: target.id,
      action: AuditAction.SESSION_REVOKED,
      after: { revokedBy: 'admin', revokedSessions: revoked },
      ...context,
    });

    return { revokedSessions: revoked };
  }

  /**
   * Loads a user within the caller's tenant.
   *
   * `findFirst` with `tenantId`, never `findUnique` by id alone: a user from
   * another tenant must read as "not found", not as "forbidden", so the
   * response never confirms that the id exists somewhere.
   */
  private async requireUser(tenantId: string, id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      ...USER_WITH_ROLES,
    });

    if (!user) {
      throw AppException.notFound('User');
    }

    return user;
  }

  private assertNotSelf(actor: RequestUser, targetId: string, message: string): void {
    if (actor.id === targetId) {
      throw AppException.forbidden(message);
    }
  }

  private assertOutranks(actor: RequestUser, target: UserRecord, message: string): void {
    if (highestRank(roleKeysOf(target)) < highestRank(actor.roles)) {
      throw AppException.forbidden(message);
    }
  }

  /** Refuses the change that would leave the tenant with no Super Admin. */
  private async assertNotLastSuperAdmin(tenantId: string, target: UserRecord): Promise<void> {
    if (!roleKeysOf(target).includes(ROLES.SUPER_ADMIN)) return;

    const remaining = await this.prisma.user.count({
      where: {
        tenantId,
        status: UserStatus.ACTIVE,
        id: { not: target.id },
        roles: { some: { role: { key: ROLES.SUPER_ADMIN } } },
      },
    });

    if (remaining === 0) {
      throw AppException.conflict(
        'This is the last Super Admin. Grant the role to another user first.',
      );
    }
  }
}

function roleKeysOf(user: UserRecord) {
  return user.roles.map((assignment) => assignment.role.key).filter(isRoleKey);
}

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    roles: roleKeysOf(user),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

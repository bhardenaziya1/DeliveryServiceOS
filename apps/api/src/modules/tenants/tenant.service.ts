import { Injectable } from '@nestjs/common';
import { AuditAction, UserStatus } from '@prisma/client';
import type { TenantDto, UpdateTenantInput } from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { AuditService, type AuditRequestContext } from '../../common/audit/audit.service';
import type { RequestUser } from '../../common/types/request-user';

/**
 * The caller's own tenant.
 *
 * There is deliberately no "list tenants" and no "get tenant by id": a signed-
 * in user has exactly one tenant, it comes from their access token, and every
 * method here takes it from `RequestUser`. Tenant *creation* is part of
 * sign-up and lives in `AuthService.register`.
 */
@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findCurrent(tenantId: string): Promise<TenantDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { users: { where: { status: { not: UserStatus.DISABLED } } } } },
      },
    });

    if (!tenant) {
      throw AppException.notFound('Tenant');
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      isActive: tenant.isActive,
      userCount: tenant._count.users,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }

  async updateCurrent(
    actor: RequestUser,
    input: UpdateTenantInput,
    context?: AuditRequestContext,
  ): Promise<TenantDto> {
    const before = await this.findCurrent(actor.tenantId);

    await this.prisma.tenant.update({
      where: { id: actor.tenantId },
      data: { ...(input.name !== undefined ? { name: input.name } : {}) },
    });

    const after = await this.findCurrent(actor.tenantId);

    await this.auditService.recordForUser(actor, {
      entityType: 'Tenant',
      entityId: actor.tenantId,
      action: AuditAction.UPDATE,
      before: { name: before.name },
      after: { name: after.name },
      ...context,
    });

    return after;
  }
}

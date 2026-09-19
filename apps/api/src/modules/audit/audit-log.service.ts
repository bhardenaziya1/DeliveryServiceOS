import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLogDto, AuditLogQuery, PaginatedResult } from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPaginatedResult } from '../../common/pagination/paginate';

/**
 * Read access to the audit trail.
 *
 * Read-only by design: there is no update or delete anywhere in this module,
 * because an append-only trail that can be edited is not evidence of anything.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: AuditLogQuery): Promise<PaginatedResult<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.search
        ? {
            OR: [
              // Both branches keep `tenantId` from the enclosing clause, so the
              // search can never widen the result set past this tenant.
              { actorEmail: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPaginatedResult(
      items.map((log) => ({
        id: log.id,
        tenantId: log.tenantId,
        actorUserId: log.actorUserId,
        actorEmail: log.actorEmail,
        entityType: log.entityType,
        entityId: log.entityId,
        action: log.action,
        before: log.before,
        after: log.after,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
}

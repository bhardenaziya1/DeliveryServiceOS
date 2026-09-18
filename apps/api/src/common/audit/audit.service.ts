import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecordAuditInput {
  tenantId: string;
  actorUserId?: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}

// Append-only audit trail writer. Callers never update or delete a row -
// corrections are new audit entries, matching the immutable-ledger rule
// used for locked financial periods elsewhere in the system.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        before: input.before === undefined ? undefined : (input.before as object),
        after: input.after === undefined ? undefined : (input.after as object),
      },
    });
  }
}

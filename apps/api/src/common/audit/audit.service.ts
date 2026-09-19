import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

/** Request-derived context attached to an audit row. */
export interface AuditRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface RecordAuditInput extends AuditRequestContext {
  tenantId: string;
  actorUserId?: string | null;
  /** Denormalised so the trail still reads correctly after a user is renamed. */
  actorEmail?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}

/**
 * Fields that must never reach the audit trail, at any nesting depth.
 *
 * Audit rows are long-lived and widely readable (anyone with `audit:read`), so
 * a password hash or a token digest landing in a `before`/`after` snapshot
 * would quietly turn the trail into a secret store.
 */
const REDACTED_FIELDS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'tokenHash',
  'refreshToken',
  'accessToken',
]);

const REDACTED = '[redacted]';

export function redactForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  // Guards against a cycle or a pathologically nested payload bloating the row.
  if (depth > 6) return REDACTED;

  if (Array.isArray(value)) {
    return value.map((entry) => redactForAudit(entry, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = REDACTED_FIELDS.has(key) ? REDACTED : redactForAudit(entry, depth + 1);
    }
    return result;
  }

  return value;
}

/**
 * Append-only audit trail writer. Callers never update or delete a row -
 * corrections are new audit entries, matching the immutable-ledger rule used
 * for locked financial periods elsewhere in the system.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  async record(input: RecordAuditInput): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: toJson(input.before),
      after: toJson(input.after),
      ipAddress: input.ipAddress ?? null,
      userAgent: truncate(input.userAgent, 512),
      requestId: input.requestId ?? null,
    };

    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      // An audit write must never turn a successful business operation into a
      // failed request - but a silently missing trail is worse than a loud
      // one, so the failure is logged at error level with the full payload.
      this.logger.error(
        { err: error, audit: { ...data, before: undefined, after: undefined } },
        'Failed to write audit log entry',
      );
    }
  }

  /** Convenience for the common "record against the acting user" case. */
  async recordForUser(
    actor: { id: string; tenantId: string; email: string },
    input: Omit<RecordAuditInput, 'tenantId' | 'actorUserId' | 'actorEmail'>,
  ): Promise<void> {
    await this.record({
      ...input,
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      actorEmail: actor.email,
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return redactForAudit(value) as Prisma.InputJsonValue;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

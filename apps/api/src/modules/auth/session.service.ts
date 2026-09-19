import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import type { SessionDto } from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { AuditService, type AuditRequestContext } from '../../common/audit/audit.service';
import type { RequestUser } from '../../common/types/request-user';
import { TokenService } from './token.service';

/**
 * "Where am I signed in?" and "sign that device out".
 *
 * Only live sessions are listed - a revoked one is not something a user can
 * act on, and the full history belongs in the audit trail.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  async listForUser(actor: RequestUser): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        tenantId: actor.tenantId,
        userId: actor.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      rememberMe: session.rememberMe,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      current: session.id === actor.sessionId,
    }));
  }

  /**
   * Revokes one of the caller's own sessions.
   *
   * Scoped to `userId` as well as `tenantId`, so this endpoint can never be
   * turned into "sign out another user" by guessing a session id. Revoking
   * someone else's session is an administrative action and lives behind
   * `sessions:revoke` on the users module.
   */
  async revokeOwn(
    actor: RequestUser,
    sessionId: string,
    context?: AuditRequestContext,
  ): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, tenantId: actor.tenantId, userId: actor.id },
    });

    if (!session) {
      throw AppException.notFound('Session');
    }

    await this.tokenService.revokeSession(session.id, actor.tenantId, 'revoked_by_user');

    await this.auditService.record({
      ...context,
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      actorEmail: actor.email,
      entityType: 'Session',
      entityId: session.id,
      action: AuditAction.SESSION_REVOKED,
      after: { revokedBy: 'self' },
    });
  }
}

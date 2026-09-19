import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, Prisma, type RefreshToken, type Session } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import type { AuthTokens } from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService, type AuditRequestContext } from '../../common/audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { generateSecureToken, hashToken } from '../../common/crypto/secure-token';

/**
 * The access-token payload.
 *
 * It carries only identifiers. Roles and permissions are resolved from the
 * database on every request (see `JwtStrategy`), so a demotion or a revoked
 * session takes effect on the next request rather than at the token's expiry.
 */
export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  /** Session id, so revoking a session invalidates its access tokens too. */
  sid: string;
}

export interface IssueSessionParams {
  userId: string;
  tenantId: string;
  rememberMe: boolean;
  context?: AuditRequestContext;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Issues, rotates and revokes sessions and their tokens.
 *
 * Refresh tokens rotate on every use: the presented token is revoked and a new
 * one issued in the same transaction. Presenting an already-rotated token means
 * either a stolen token or a replayed one, and in both cases the safe response
 * is the same - kill the whole session.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly auditService: AuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TokenService.name);
  }

  /** Access-token lifetime in seconds, for the `expiresIn` field clients read. */
  get accessTokenTtlSeconds(): number {
    return parseDuration(this.config.get('JWT_ACCESS_EXPIRES_IN'));
  }

  refreshTtlDays(rememberMe: boolean): number {
    return rememberMe
      ? this.config.get('REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS')
      : this.config.get('REFRESH_TOKEN_TTL_DAYS');
  }

  /** Starts a new session and issues its first token pair. */
  async issueSession(params: IssueSessionParams): Promise<AuthTokens & { sessionId: string }> {
    const ttlDays = this.refreshTtlDays(params.rememberMe);
    const expiresAt = new Date(Date.now() + ttlDays * MILLISECONDS_PER_DAY);

    const session = await this.prisma.session.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        rememberMe: params.rememberMe,
        ipAddress: params.context?.ipAddress ?? null,
        userAgent: params.context?.userAgent ?? null,
        expiresAt,
      },
    });

    return this.issueTokenPair(session, params.context);
  }

  /**
   * Exchanges a refresh token for a new pair, rotating the presented token.
   *
   * The whole exchange runs in one transaction: a concurrent replay either
   * sees the token already revoked (and trips reuse detection) or blocks -
   * it can never mint a second live token from the same parent.
   */
  async rotate(
    presentedToken: string,
    context?: AuditRequestContext,
  ): Promise<AuthTokens & { sessionId: string; userId: string; tenantId: string }> {
    const tokenHash = hashToken(presentedToken);

    // Unscoped: the token is the only thing identifying the caller, so the
    // tenant is a *result* of this lookup rather than an input to it.
    const existing = await this.prisma.unscoped(() =>
      this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: { session: true, user: true },
      }),
    );

    if (!existing) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    if (existing.revokedAt) {
      // A token that has already been rotated is being presented again. Either
      // it was stolen and the thief is racing the real user, or the real user
      // is replaying a token an attacker already spent. Both are resolved the
      // same way: end every session-bound token so whoever holds a copy loses
      // it, and force a fresh login.
      await this.revokeSessionTokens(
        existing.sessionId,
        existing.tenantId,
        'refresh_token_reuse_detected',
      );

      this.logger.warn(
        {
          userId: existing.userId,
          tenantId: existing.tenantId,
          sessionId: existing.sessionId,
          refreshTokenId: existing.id,
        },
        'Refresh token reuse detected - session revoked',
      );

      await this.auditService.record({
        ...context,
        tenantId: existing.tenantId,
        actorUserId: existing.userId,
        actorEmail: existing.user.email,
        entityType: 'Session',
        entityId: existing.sessionId,
        action: AuditAction.TOKEN_REUSE_DETECTED,
      });

      throw AppException.unauthorized('Invalid or expired session');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    const session = existing.session;
    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    if (existing.user.status !== 'ACTIVE') {
      throw AppException.unauthorized('Invalid or expired session');
    }

    const issued = await this.issueTokenPair(session, context, existing.id);

    await this.auditService.record({
      ...context,
      tenantId: existing.tenantId,
      actorUserId: existing.userId,
      actorEmail: existing.user.email,
      entityType: 'Session',
      entityId: session.id,
      action: AuditAction.TOKEN_REFRESHED,
    });

    return {
      ...issued,
      userId: existing.userId,
      tenantId: existing.tenantId,
    };
  }

  /**
   * Mints a token pair for an existing session, optionally retiring the
   * refresh token it replaces.
   */
  private async issueTokenPair(
    session: Session,
    context?: AuditRequestContext,
    replacesTokenId?: string,
  ): Promise<AuthTokens & { sessionId: string }> {
    const { token, tokenHash } = generateSecureToken();
    const ttlDays = this.refreshTtlDays(session.rememberMe);

    // A refresh token never outlives its session, so a "remember me" session
    // still ends on schedule instead of being extended indefinitely by use.
    const tokenExpiry = new Date(
      Math.min(Date.now() + ttlDays * MILLISECONDS_PER_DAY, session.expiresAt.getTime()),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const refreshToken = await tx.refreshToken.create({
        data: {
          tenantId: session.tenantId,
          userId: session.userId,
          sessionId: session.id,
          tokenHash,
          expiresAt: tokenExpiry,
          ipAddress: context?.ipAddress ?? null,
          userAgent: context?.userAgent ?? null,
        },
      });

      if (replacesTokenId) {
        await tx.refreshToken.update({
          // Scoped by tenant as well as id: the guard requires it, and it
          // means a mismatched pair can never be rotated across tenants.
          where: { id: replacesTokenId, tenantId: session.tenantId },
          data: {
            revokedAt: new Date(),
            revokedReason: 'rotated',
            replacedById: refreshToken.id,
          },
        });
      }

      await tx.session.update({
        where: { id: session.id, tenantId: session.tenantId },
        data: { lastSeenAt: new Date() },
      });

      return refreshToken;
    });

    const accessToken = await this.jwtService.signAsync({
      sub: session.userId,
      tenantId: session.tenantId,
      sid: session.id,
    } satisfies AccessTokenPayload);

    return {
      accessToken,
      refreshToken: token,
      expiresIn: this.accessTokenTtlSeconds,
      tokenType: 'Bearer',
      sessionId: created.sessionId,
    };
  }

  /** Ends one session and every refresh token issued under it. */
  async revokeSession(sessionId: string, tenantId: string, reason: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, tenantId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, tenantId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
    ]);
  }

  private async revokeSessionTokens(
    sessionId: string,
    tenantId: string,
    reason: string,
  ): Promise<void> {
    await this.revokeSession(sessionId, tenantId, reason);
  }

  /**
   * Ends every session for a user.
   *
   * Used after a password change or reset, and by "sign out everywhere".
   * `exceptSessionId` keeps the caller's own session alive where that is the
   * intended behaviour (changing your password should not sign you out of the
   * tab you changed it in).
   */
  async revokeAllUserSessions(
    userId: string,
    tenantId: string,
    reason: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const where: Prisma.SessionWhereInput = {
      userId,
      tenantId,
      revokedAt: null,
      ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}),
    };

    const sessions = await this.prisma.session.findMany({ where, select: { id: true } });
    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length === 0) return 0;

    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: { in: sessionIds }, tenantId },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, tenantId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
    ]);

    return sessionIds.length;
  }

  /** Revokes the single refresh token presented at logout, if it is still live. */
  async revokeRefreshToken(
    presentedToken: string,
    reason: string,
  ): Promise<RefreshToken | undefined> {
    // Unscoped: same as `rotate` - the hash is what identifies the tenant.
    const existing = await this.prisma.unscoped(() =>
      this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(presentedToken) } }),
    );

    if (!existing || existing.revokedAt) return undefined;

    await this.prisma.refreshToken.update({
      where: { id: existing.id, tenantId: existing.tenantId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });

    return existing;
  }
}

/**
 * Converts a `30s` / `15m` / `8h` / `7d` duration into seconds.
 *
 * The env schema guarantees the shape, so this never has to handle garbage.
 */
export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported duration: ${value}`);
  }

  const amount = Number(match[1]);
  switch (match[2]) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    default:
      return amount * 24 * 60 * 60;
  }
}

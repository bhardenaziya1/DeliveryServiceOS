import { Injectable } from '@nestjs/common';
import { AuditAction, UserStatus, type Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import {
  ROLES,
  slugifyTenantName,
  type AuthSession,
  type CurrentUserResponse,
  type LoginInput,
  type RegisterInput,
} from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/errors/app.exception';
import { AuditService, type AuditRequestContext } from '../../common/audit/audit.service';
import { PasswordService } from '../../common/crypto/password.service';
import { AuthMailService } from '../../common/mail/auth-mail.service';
import { generateSecureToken, hashToken } from '../../common/crypto/secure-token';
import type { RequestUser } from '../../common/types/request-user';
import { TokenService } from './token.service';
import { UserContextService, type UserWithRoles } from './user-context.service';

const MILLISECONDS_PER_MINUTE = 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly userContext: UserContextService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly authMail: AuthMailService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  // -------------------------------------------------------------------------
  // Registration - creates a tenant and its first Super Admin
  // -------------------------------------------------------------------------

  /**
   * Public sign-up.
   *
   * Provisioning a tenant and its owner is one transaction: a tenant with no
   * way to sign in, or a user with no tenant, are both unrecoverable states.
   */
  async register(input: RegisterInput, context?: AuditRequestContext): Promise<AuthSession> {
    const passwordHash = await this.passwordService.hash(input.password);

    // Unscoped: there is no tenant yet - creating one is the point.
    const created = await this.prisma.unscoped(() =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email: input.email } });
        if (existing) {
          throw AppException.conflict('An account already exists for this email address');
        }

        const slug = await this.resolveTenantSlug(tx, input.tenantSlug ?? input.tenantName);

        const tenant = await tx.tenant.create({
          data: { name: input.tenantName, slug },
        });

        const superAdmin = await tx.role.findUnique({ where: { key: ROLES.SUPER_ADMIN } });
        if (!superAdmin) {
          // The roles table is seeded at deploy time; missing it is a broken
          // environment, not something a caller did wrong.
          throw new Error(
            'System roles are not seeded. Run `npm run db:seed` before serving requests.',
          );
        }

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.email,
            passwordHash,
            fullName: input.fullName,
            status: UserStatus.ACTIVE,
            passwordChangedAt: new Date(),
            roles: {
              create: [{ tenantId: tenant.id, roleId: superAdmin.id }],
            },
          },
          include: { tenant: true, roles: { include: { role: true } } },
        });

        return user;
      }),
    );

    await this.auditService.record({
      ...context,
      tenantId: created.tenantId,
      actorUserId: created.id,
      actorEmail: created.email,
      entityType: 'Tenant',
      entityId: created.tenantId,
      action: AuditAction.TENANT_CREATED,
      after: { name: created.tenant.name, slug: created.tenant.slug },
    });

    await this.auditService.record({
      ...context,
      tenantId: created.tenantId,
      actorUserId: created.id,
      actorEmail: created.email,
      entityType: 'User',
      entityId: created.id,
      action: AuditAction.USER_REGISTERED,
      after: { email: created.email, fullName: created.fullName, roles: [ROLES.SUPER_ADMIN] },
    });

    await this.sendEmailVerification(created, context);

    const tokens = await this.tokenService.issueSession({
      userId: created.id,
      tenantId: created.tenantId,
      rememberMe: false,
      context,
    });

    await this.auditService.record({
      ...context,
      tenantId: created.tenantId,
      actorUserId: created.id,
      actorEmail: created.email,
      entityType: 'User',
      entityId: created.id,
      action: AuditAction.LOGIN,
    });

    return {
      ...tokens,
      user: UserContextService.toAuthUser(created),
      tenant: UserContextService.toAuthTenant(created),
    };
  }

  /** Finds a free slug, appending a counter when the preferred one is taken. */
  private async resolveTenantSlug(
    tx: Prisma.TransactionClient,
    preferred: string,
  ): Promise<string> {
    const base = slugifyTenantName(preferred) || 'tenant';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await tx.tenant.findUnique({ where: { slug: candidate } });
      if (!taken) return candidate;
    }

    throw AppException.conflict('Could not allocate a tenant slug. Choose a different name.');
  }

  // -------------------------------------------------------------------------
  // Login / logout
  // -------------------------------------------------------------------------

  /**
   * Authenticates an email/password pair and starts a session.
   *
   * Every failure - unknown email, wrong password, disabled account, locked
   * account - returns the same message, and the unknown-email path still burns
   * a password verification so the timing matches. Neither the response nor the
   * clock reveals whether an address is registered.
   */
  async login(input: LoginInput, context?: AuditRequestContext): Promise<AuthSession> {
    const user = await this.userContext.findByEmailForAuthentication(input.email);

    if (!user) {
      await this.passwordService.verifyDecoy(input.password);
      throw AppException.unauthorized('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.recordFailedLogin(user, context, 'account_locked');
      throw AppException.unauthorized('Invalid email or password');
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, input.password);

    if (!passwordValid) {
      await this.registerFailedAttempt(user, context);
      throw AppException.unauthorized('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE || !user.tenant.isActive) {
      await this.recordFailedLogin(user, context, 'account_inactive');
      throw AppException.unauthorized('Invalid email or password');
    }

    const updates: Prisma.UserUpdateInput = {
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    };

    // Transparently upgrade hashes written under an older cost setting.
    if (this.passwordService.needsRehash(user.passwordHash)) {
      updates.passwordHash = await this.passwordService.hash(input.password);
    }

    await this.prisma.user.update({
      where: { id: user.id, tenantId: user.tenantId },
      data: updates,
    });

    const tokens = await this.tokenService.issueSession({
      userId: user.id,
      tenantId: user.tenantId,
      rememberMe: input.rememberMe ?? false,
      context,
    });

    await this.auditService.record({
      ...context,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.LOGIN,
      after: { sessionId: tokens.sessionId, rememberMe: input.rememberMe ?? false },
    });

    return {
      ...tokens,
      user: UserContextService.toAuthUser(user),
      tenant: UserContextService.toAuthTenant(user),
    };
  }

  /** Counts a bad password and locks the account once the threshold is hit. */
  private async registerFailedAttempt(
    user: UserWithRoles,
    context?: AuditRequestContext,
  ): Promise<void> {
    const maxAttempts = this.config.get('LOGIN_MAX_FAILED_ATTEMPTS');
    const nextCount = user.failedLoginCount + 1;
    const shouldLock = nextCount >= maxAttempts;

    await this.prisma.user.update({
      where: { id: user.id, tenantId: user.tenantId },
      data: {
        failedLoginCount: nextCount,
        lockedUntil: shouldLock
          ? new Date(
              Date.now() + this.config.get('LOGIN_LOCKOUT_MINUTES') * MILLISECONDS_PER_MINUTE,
            )
          : user.lockedUntil,
      },
    });

    await this.recordFailedLogin(
      user,
      context,
      shouldLock ? 'invalid_password_account_locked' : 'invalid_password',
    );
  }

  private async recordFailedLogin(
    user: UserWithRoles,
    context: AuditRequestContext | undefined,
    reason: string,
  ): Promise<void> {
    await this.auditService.record({
      ...context,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.LOGIN_FAILED,
      after: { reason },
    });
  }

  /**
   * Ends the caller's session (or all of their sessions).
   *
   * Idempotent: signing out twice, or with a token that has already expired,
   * succeeds. There is nothing useful a client can do with a logout failure.
   */
  async logout(
    actor: RequestUser,
    input: { refreshToken?: string; allSessions?: boolean },
    context?: AuditRequestContext,
  ): Promise<{ revokedSessions: number }> {
    if (input.allSessions) {
      const revoked = await this.tokenService.revokeAllUserSessions(
        actor.id,
        actor.tenantId,
        'user_logout_all',
      );

      await this.auditService.record({
        ...context,
        tenantId: actor.tenantId,
        actorUserId: actor.id,
        actorEmail: actor.email,
        entityType: 'User',
        entityId: actor.id,
        action: AuditAction.LOGOUT,
        after: { scope: 'all_sessions', revokedSessions: revoked },
      });

      return { revokedSessions: revoked };
    }

    // The access token already identifies the session, so a logout works even
    // if the client has lost its refresh token.
    await this.tokenService.revokeSession(actor.sessionId, actor.tenantId, 'user_logout');

    if (input.refreshToken) {
      await this.tokenService.revokeRefreshToken(input.refreshToken, 'user_logout');
    }

    await this.auditService.record({
      ...context,
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      actorEmail: actor.email,
      entityType: 'Session',
      entityId: actor.sessionId,
      action: AuditAction.LOGOUT,
      after: { scope: 'current_session' },
    });

    return { revokedSessions: 1 };
  }

  /** Exchanges a refresh token for a fresh pair, rotating the old one. */
  async refresh(refreshToken: string, context?: AuditRequestContext): Promise<AuthSession> {
    const rotated = await this.tokenService.rotate(refreshToken, context);

    const user = await this.userContext.findById(rotated.userId, rotated.tenantId);
    if (!user) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: rotated.expiresIn,
      tokenType: rotated.tokenType,
      sessionId: rotated.sessionId,
      user: UserContextService.toAuthUser(user),
      tenant: UserContextService.toAuthTenant(user),
    };
  }

  // -------------------------------------------------------------------------
  // Current user
  // -------------------------------------------------------------------------

  async currentUser(actor: RequestUser): Promise<CurrentUserResponse> {
    const user = await this.userContext.findById(actor.id, actor.tenantId);
    if (!user) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    return {
      user: UserContextService.toAuthUser(user),
      tenant: UserContextService.toAuthTenant(user),
      sessionId: actor.sessionId,
    };
  }

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  /**
   * Starts a password reset.
   *
   * Always reports success. Telling an anonymous caller whether an address is
   * registered turns this endpoint into an account-enumeration oracle, and the
   * caller has no legitimate use for the distinction.
   */
  async forgotPassword(email: string, context?: AuditRequestContext): Promise<void> {
    const user = await this.userContext.findByEmailForAuthentication(email);

    if (!user || user.status === UserStatus.DISABLED) {
      this.logger.info({ email }, 'Password reset requested for unknown or disabled account');
      return;
    }

    const { token, tokenHash } = generateSecureToken();
    const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES');

    await this.prisma.$transaction([
      // Only the newest link should work: issuing a second one silently
      // invalidates the first.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, tenantId: user.tenantId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + ttlMinutes * MILLISECONDS_PER_MINUTE),
          ipAddress: context?.ipAddress ?? null,
        },
      }),
    ]);

    await this.authMail.sendPasswordReset({
      to: user.email,
      fullName: user.fullName,
      token,
      expiresInMinutes: ttlMinutes,
    });

    await this.auditService.record({
      ...context,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
    });
  }

  /**
   * Completes a password reset.
   *
   * Consuming the token, writing the new hash and revoking every session
   * happen together: if the reset was triggered by a compromise, leaving the
   * attacker's existing session alive would defeat the point.
   */
  async resetPassword(
    token: string,
    newPassword: string,
    context?: AuditRequestContext,
  ): Promise<void> {
    // Unscoped: the token hash is the only identifier the caller has.
    const record = await this.prisma.unscoped(() =>
      this.prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      }),
    );

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw AppException.validation('This password reset link is invalid or has expired');
    }

    if (record.user.status === UserStatus.DISABLED) {
      throw AppException.validation('This password reset link is invalid or has expired');
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id, tenantId: record.tenantId },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId, tenantId: record.tenantId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
          // Completing a reset proves control of the mailbox.
          ...(record.user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
          // An invited user who reset instead of accepting is still a real user.
          ...(record.user.status === UserStatus.INVITED ? { status: UserStatus.ACTIVE } : {}),
        },
      }),
    ]);

    await this.tokenService.revokeAllUserSessions(record.userId, record.tenantId, 'password_reset');

    await this.authMail.sendPasswordChangedNotice({
      to: record.user.email,
      fullName: record.user.fullName,
    });

    await this.auditService.record({
      ...context,
      tenantId: record.tenantId,
      actorUserId: record.userId,
      actorEmail: record.user.email,
      entityType: 'User',
      entityId: record.userId,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
    });
  }

  /**
   * Changes the signed-in user's own password.
   *
   * Every *other* session is revoked, but the caller's own survives - being
   * signed out of the tab you just used is confusing, and the current password
   * has already been proven here.
   */
  async changePassword(
    actor: RequestUser,
    currentPassword: string,
    newPassword: string,
    context?: AuditRequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, tenantId: actor.tenantId },
    });

    if (!user) {
      throw AppException.unauthorized();
    }

    const valid = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw AppException.validation('Your current password is incorrect', {
        currentPassword: ['Your current password is incorrect'],
      });
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.user.update({
      where: { id: user.id, tenantId: user.tenantId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    const revoked = await this.tokenService.revokeAllUserSessions(
      user.id,
      user.tenantId,
      'password_changed',
      actor.sessionId,
    );

    await this.authMail.sendPasswordChangedNotice({
      to: user.email,
      fullName: user.fullName,
    });

    await this.auditService.record({
      ...context,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.PASSWORD_CHANGED,
      after: { revokedOtherSessions: revoked },
    });
  }

  // -------------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------------

  async sendEmailVerification(
    user: Pick<UserWithRoles, 'id' | 'tenantId' | 'email' | 'fullName'>,
    context?: AuditRequestContext,
  ): Promise<void> {
    const { token, tokenHash } = generateSecureToken();
    const ttlHours = this.config.get('EMAIL_VERIFICATION_TTL_HOURS');

    await this.prisma.emailVerificationToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlHours * 60 * MILLISECONDS_PER_MINUTE),
      },
    });

    await this.authMail.sendEmailVerification({
      to: user.email,
      fullName: user.fullName,
      token,
      expiresInHours: ttlHours,
    });

    await this.auditService.record({
      ...context,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.EMAIL_VERIFICATION_SENT,
    });
  }

  async resendEmailVerification(actor: RequestUser, context?: AuditRequestContext): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, tenantId: actor.tenantId },
    });

    if (!user || user.emailVerifiedAt) return;

    await this.sendEmailVerification(user, context);
  }

  async verifyEmail(token: string, context?: AuditRequestContext): Promise<void> {
    // Unscoped: verification links are followed while signed out.
    const record = await this.prisma.unscoped(() =>
      this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      }),
    );

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw AppException.validation('This verification link is invalid or has expired');
    }

    // The address may have changed since the link was sent; confirming it onto
    // the *current* address would verify something the user never proved.
    if (record.email !== record.user.email) {
      throw AppException.validation('This verification link is invalid or has expired');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id, tenantId: record.tenantId },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId, tenantId: record.tenantId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    await this.auditService.record({
      ...context,
      tenantId: record.tenantId,
      actorUserId: record.userId,
      actorEmail: record.user.email,
      entityType: 'User',
      entityId: record.userId,
      action: AuditAction.EMAIL_VERIFIED,
    });
  }
}

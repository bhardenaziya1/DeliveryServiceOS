import { AuditAction, UserStatus } from '@prisma/client';
import { ROLES } from '@vendoros/shared';
import { AuthService } from './auth.service';
import { AppException } from '../../common/errors/app.exception';

const TENANT_A = 'tenant-a';
const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

const CONFIG: Record<string, unknown> = {
  LOGIN_MAX_FAILED_ATTEMPTS: 3,
  LOGIN_LOCKOUT_MINUTES: 15,
  PASSWORD_RESET_TTL_MINUTES: 30,
  EMAIL_VERIFICATION_TTL_HOURS: 48,
};

function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    tenantId: TENANT_A,
    email: 'owner@tenant-a.ae',
    passwordHash: 'stored-hash',
    fullName: 'Tenant A Owner',
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date('2026-01-01'),
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date('2026-01-01'),
    tenant: { id: TENANT_A, name: 'Tenant A', slug: 'tenant-a', isActive: true },
    roles: [{ role: { key: ROLES.SUPER_ADMIN } }],
    ...overrides,
  };
}

const requestUser = {
  id: USER_ID,
  tenantId: TENANT_A,
  email: 'owner@tenant-a.ae',
  fullName: 'Tenant A Owner',
  emailVerified: true,
  roles: [ROLES.SUPER_ADMIN],
  permissions: [],
  sessionId: SESSION_ID,
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    unscoped: jest.Mock;
    $transaction: jest.Mock;
    user: { findFirst: jest.Mock; update: jest.Mock };
    passwordResetToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    emailVerificationToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let tokenService: {
    issueSession: jest.Mock;
    rotate: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllUserSessions: jest.Mock;
    revokeRefreshToken: jest.Mock;
  };
  let userContext: { findById: jest.Mock; findByEmailForAuthentication: jest.Mock };
  let passwordService: {
    hash: jest.Mock;
    verify: jest.Mock;
    verifyDecoy: jest.Mock;
    needsRehash: jest.Mock;
  };
  let auditService: { record: jest.Mock; recordForUser: jest.Mock };
  let authMail: {
    sendPasswordReset: jest.Mock;
    sendEmailVerification: jest.Mock;
    sendPasswordChangedNotice: jest.Mock;
  };
  let logger: { setContext: jest.Mock; info: jest.Mock };

  /** The audit actions recorded during the test, in order. */
  const auditedActions = () => auditService.record.mock.calls.map((call) => call[0].action);

  beforeEach(() => {
    prisma = {
      unscoped: jest.fn((fn: () => unknown) => fn()),
      $transaction: jest.fn().mockResolvedValue([]),
      user: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
      passwordResetToken: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };

    tokenService = {
      issueSession: jest.fn().mockResolvedValue({
        accessToken: 'access-jwt',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        tokenType: 'Bearer',
        sessionId: SESSION_ID,
      }),
      rotate: jest.fn(),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeAllUserSessions: jest.fn().mockResolvedValue(2),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
    };

    userContext = { findById: jest.fn(), findByEmailForAuthentication: jest.fn() };

    passwordService = {
      hash: jest.fn().mockResolvedValue('new-hash'),
      verify: jest.fn().mockResolvedValue(true),
      verifyDecoy: jest.fn().mockResolvedValue(false),
      needsRehash: jest.fn().mockReturnValue(false),
    };

    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
      recordForUser: jest.fn().mockResolvedValue(undefined),
    };

    authMail = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
      sendPasswordChangedNotice: jest.fn().mockResolvedValue(undefined),
    };

    logger = { setContext: jest.fn(), info: jest.fn() };

    service = new AuthService(
      prisma as never,
      tokenService as never,
      userContext as never,
      passwordService as never,
      auditService as never,
      authMail as never,
      { get: (key: string) => CONFIG[key] } as never,
      logger as never,
    );
  });

  describe('login', () => {
    it('issues a session and audits the success', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());

      const session = await service.login({
        email: 'owner@tenant-a.ae',
        password: 'CorrectPassword1',
        rememberMe: false,
      });

      expect(session.accessToken).toBe('access-jwt');
      expect(session.refreshToken).toBe('refresh-token');
      expect(session.user.roles).toEqual([ROLES.SUPER_ADMIN]);
      expect(session.tenant.slug).toBe('tenant-a');
      expect(auditedActions()).toContain(AuditAction.LOGIN);
    });

    it('never returns the password hash', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());

      const session = await service.login({
        email: 'owner@tenant-a.ae',
        password: 'CorrectPassword1',
        rememberMe: false,
      });

      expect(JSON.stringify(session)).not.toContain('stored-hash');
      expect(session.user).not.toHaveProperty('passwordHash');
    });

    it('passes the remember-me flag through to the session', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());

      await service.login({
        email: 'owner@tenant-a.ae',
        password: 'CorrectPassword1',
        rememberMe: true,
      });

      expect(tokenService.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({ rememberMe: true }),
      );
    });

    it('rejects an unknown email without revealing that it is unknown', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nobody@tenant-a.ae',
          password: 'whatever12345',
          rememberMe: false,
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('still burns a password verification for an unknown email', async () => {
      // Without this the response time alone tells an attacker which addresses
      // are registered.
      userContext.findByEmailForAuthentication.mockResolvedValue(null);

      await service
        .login({ email: 'nobody@tenant-a.ae', password: 'whatever12345', rememberMe: false })
        .catch(() => undefined);

      expect(passwordService.verifyDecoy).toHaveBeenCalledWith('whatever12345');
    });

    it('rejects a wrong password with the same message as an unknown email', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'owner@tenant-a.ae',
          password: 'WrongPassword1',
          rememberMe: false,
        }),
      ).rejects.toThrow('Invalid email or password');
      expect(tokenService.issueSession).not.toHaveBeenCalled();
    });

    it('counts a failed attempt and audits it', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(
        storedUser({ failedLoginCount: 1 }),
      );
      passwordService.verify.mockResolvedValue(false);

      await service
        .login({ email: 'owner@tenant-a.ae', password: 'WrongPassword1', rememberMe: false })
        .catch(() => undefined);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: 2 }),
        }),
      );
      expect(auditedActions()).toContain(AuditAction.LOGIN_FAILED);
    });

    it('locks the account once the attempt threshold is reached', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(
        storedUser({ failedLoginCount: 2 }),
      );
      passwordService.verify.mockResolvedValue(false);

      await service
        .login({ email: 'owner@tenant-a.ae', password: 'WrongPassword1', rememberMe: false })
        .catch(() => undefined);

      const { lockedUntil } = prisma.user.update.mock.calls[0][0].data;
      expect(lockedUntil).toBeInstanceOf(Date);
      expect(lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('refuses a locked account even with the right password', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(
        storedUser({ lockedUntil: new Date(Date.now() + 60_000) }),
      );

      await expect(
        service.login({
          email: 'owner@tenant-a.ae',
          password: 'CorrectPassword1',
          rememberMe: false,
        }),
      ).rejects.toThrow('Invalid email or password');
      expect(tokenService.issueSession).not.toHaveBeenCalled();
    });

    it('refuses a disabled user even with the right password', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(
        storedUser({ status: UserStatus.DISABLED }),
      );

      await expect(
        service.login({
          email: 'owner@tenant-a.ae',
          password: 'CorrectPassword1',
          rememberMe: false,
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('refuses a user whose tenant has been deactivated', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(
        storedUser({
          tenant: { id: TENANT_A, name: 'Tenant A', slug: 'tenant-a', isActive: false },
        }),
      );

      await expect(
        service.login({
          email: 'owner@tenant-a.ae',
          password: 'CorrectPassword1',
          rememberMe: false,
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('clears the failure counter on a successful login', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(
        storedUser({ failedLoginCount: 2 }),
      );

      await service.login({
        email: 'owner@tenant-a.ae',
        password: 'CorrectPassword1',
        rememberMe: false,
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID, tenantId: TENANT_A },
          data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
        }),
      );
    });

    it('upgrades a hash written under weaker parameters', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());
      passwordService.needsRehash.mockReturnValue(true);

      await service.login({
        email: 'owner@tenant-a.ae',
        password: 'CorrectPassword1',
        rememberMe: false,
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'new-hash' }) }),
      );
    });
  });

  describe('logout', () => {
    it('revokes the calling session and audits it', async () => {
      const result = await service.logout(requestUser as never, {});

      expect(tokenService.revokeSession).toHaveBeenCalledWith(SESSION_ID, TENANT_A, 'user_logout');
      expect(result.revokedSessions).toBe(1);
      expect(auditedActions()).toContain(AuditAction.LOGOUT);
    });

    it('also revokes the presented refresh token when one is given', async () => {
      await service.logout(requestUser as never, { refreshToken: 'refresh-token' });

      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('refresh-token', 'user_logout');
    });

    it('revokes every session when asked to sign out everywhere', async () => {
      const result = await service.logout(requestUser as never, { allSessions: true });

      expect(tokenService.revokeAllUserSessions).toHaveBeenCalledWith(
        USER_ID,
        TENANT_A,
        'user_logout_all',
      );
      expect(result.revokedSessions).toBe(2);
    });
  });

  describe('forgotPassword', () => {
    it('reports nothing for an unknown address', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(null);

      await expect(service.forgotPassword('nobody@tenant-a.ae')).resolves.toBeUndefined();
      expect(authMail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('emails a reset link for a known address', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());

      await service.forgotPassword('owner@tenant-a.ae');

      expect(authMail.sendPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'owner@tenant-a.ae', expiresInMinutes: 30 }),
      );
      expect(auditedActions()).toContain(AuditAction.PASSWORD_RESET_REQUESTED);
    });

    it('stores only the hash of the reset token', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());

      await service.forgotPassword('owner@tenant-a.ae');

      const emailedToken = authMail.sendPasswordReset.mock.calls[0][0].token;
      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(stored.tokenHash).not.toBe(emailedToken);
      expect(stored).not.toHaveProperty('token');
    });

    it('invalidates any outstanding link before issuing a new one', async () => {
      userContext.findByEmailForAuthentication.mockResolvedValue(storedUser());

      await service.forgotPassword('owner@tenant-a.ae');

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, tenantId: TENANT_A, usedAt: null }),
        }),
      );
    });
  });

  describe('resetPassword', () => {
    const resetRecord = (overrides: Record<string, unknown> = {}) => ({
      id: 'reset-1',
      tenantId: TENANT_A,
      userId: USER_ID,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: storedUser(),
      ...overrides,
    });

    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('bogus', 'NewPassword123')).rejects.toBeInstanceOf(
        AppException,
      );
    });

    it('rejects a token that has already been used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord({ usedAt: new Date() }));

      await expect(service.resetPassword('used', 'NewPassword123')).rejects.toBeInstanceOf(
        AppException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        resetRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.resetPassword('stale', 'NewPassword123')).rejects.toBeInstanceOf(
        AppException,
      );
    });

    it('sets the new password and revokes every session', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord());

      await service.resetPassword('good-token', 'NewPassword123');

      expect(passwordService.hash).toHaveBeenCalledWith('NewPassword123');
      expect(tokenService.revokeAllUserSessions).toHaveBeenCalledWith(
        USER_ID,
        TENANT_A,
        'password_reset',
      );
      expect(auditedActions()).toContain(AuditAction.PASSWORD_RESET_COMPLETED);
    });

    it('notifies the account owner that the password changed', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord());

      await service.resetPassword('good-token', 'NewPassword123');

      expect(authMail.sendPasswordChangedNotice).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'owner@tenant-a.ae' }),
      );
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password', async () => {
      prisma.user.findFirst.mockResolvedValue(storedUser());
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.changePassword(requestUser as never, 'WrongPassword1', 'NewPassword123'),
      ).rejects.toBeInstanceOf(AppException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('keeps the calling session alive but revokes the others', async () => {
      prisma.user.findFirst.mockResolvedValue(storedUser());

      await service.changePassword(requestUser as never, 'CurrentPassword1', 'NewPassword123');

      expect(tokenService.revokeAllUserSessions).toHaveBeenCalledWith(
        USER_ID,
        TENANT_A,
        'password_changed',
        SESSION_ID,
      );
      expect(auditedActions()).toContain(AuditAction.PASSWORD_CHANGED);
    });
  });

  describe('verifyEmail', () => {
    const verificationRecord = (overrides: Record<string, unknown> = {}) => ({
      id: 'verify-1',
      tenantId: TENANT_A,
      userId: USER_ID,
      email: 'owner@tenant-a.ae',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: storedUser({ emailVerifiedAt: null }),
      ...overrides,
    });

    it('marks the address verified and audits it', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(verificationRecord());

      await service.verifyEmail('good-token');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditedActions()).toContain(AuditAction.EMAIL_VERIFIED);
    });

    it('refuses a link issued for a different address than the account now holds', async () => {
      // Otherwise changing your email after requesting a link would let the
      // old link verify an address nobody proved control of.
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        verificationRecord({ email: 'old@tenant-a.ae' }),
      );

      await expect(service.verifyEmail('stale-address')).rejects.toBeInstanceOf(AppException);
    });

    it('refuses a token that was already used', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        verificationRecord({ usedAt: new Date() }),
      );

      await expect(service.verifyEmail('used')).rejects.toBeInstanceOf(AppException);
    });
  });
});

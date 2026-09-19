import { AuditAction } from '@prisma/client';
import { TokenService, parseDuration } from './token.service';
import { AppException } from '../../common/errors/app.exception';
import { hashToken } from '../../common/crypto/secure-token';

const TENANT_A = 'tenant-a';
const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

const CONFIG: Record<string, unknown> = {
  JWT_ACCESS_EXPIRES_IN: '15m',
  REFRESH_TOKEN_TTL_DAYS: 7,
  REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS: 30,
};

function futureDate(days = 1): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function liveSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    tenantId: TENANT_A,
    userId: USER_ID,
    rememberMe: false,
    revokedAt: null,
    expiresAt: futureDate(7),
    ...overrides,
  };
}

function liveRefreshToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refresh-1',
    tenantId: TENANT_A,
    userId: USER_ID,
    sessionId: SESSION_ID,
    tokenHash: hashToken('presented-token'),
    expiresAt: futureDate(7),
    revokedAt: null,
    session: liveSession(),
    user: { id: USER_ID, email: 'owner@tenant-a.ae', status: 'ACTIVE' },
    ...overrides,
  };
}

describe('TokenService', () => {
  let service: TokenService;
  let prisma: {
    unscoped: jest.Mock;
    $transaction: jest.Mock;
    session: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findMany: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let auditService: { record: jest.Mock };
  let logger: { setContext: jest.Mock; warn: jest.Mock };
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    prisma = {
      // The real implementation just runs the callback with a flag set.
      unscoped: jest.fn((fn: () => unknown) => fn()),
      $transaction: jest.fn(),
      session: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    // Interactive transactions get a client; array transactions just resolve.
    prisma.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.resolve([]),
    );

    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    logger = { setContext: jest.fn(), warn: jest.fn() };

    jwtService = { signAsync: jest.fn().mockResolvedValue('access-jwt') };

    // Constructed directly rather than through a testing module: every
    // dependency is a stub anyway, and this keeps the wiring visible.
    service = new TokenService(
      prisma as never,
      jwtService as never,
      { get: (key: string) => CONFIG[key] } as never,
      auditService as never,
      logger as never,
    );
  });

  describe('issueSession', () => {
    it('creates a session and its first token pair', async () => {
      prisma.session.create.mockResolvedValue(liveSession());
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1', sessionId: SESSION_ID });

      const result = await service.issueSession({
        userId: USER_ID,
        tenantId: TENANT_A,
        rememberMe: false,
      });

      expect(result.accessToken).toBe('access-jwt');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken.length).toBeGreaterThan(32);
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(15 * 60);
    });

    it('stores only the hash of the refresh token, never the token itself', async () => {
      prisma.session.create.mockResolvedValue(liveSession());
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1', sessionId: SESSION_ID });

      const result = await service.issueSession({
        userId: USER_ID,
        tenantId: TENANT_A,
        rememberMe: false,
      });

      const stored = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(stored.tokenHash).toBe(hashToken(result.refreshToken));
      expect(JSON.stringify(stored)).not.toContain(result.refreshToken);
    });

    it('gives a remember-me session the longer lifetime', async () => {
      prisma.session.create.mockResolvedValue(liveSession({ rememberMe: true }));
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1', sessionId: SESSION_ID });

      await service.issueSession({ userId: USER_ID, tenantId: TENANT_A, rememberMe: true });

      const { expiresAt } = prisma.session.create.mock.calls[0][0].data;
      const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(30);
    });

    it('records the tenant on the session so it is never global', async () => {
      prisma.session.create.mockResolvedValue(liveSession());
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1', sessionId: SESSION_ID });

      await service.issueSession({ userId: USER_ID, tenantId: TENANT_A, rememberMe: false });

      expect(prisma.session.create.mock.calls[0][0].data.tenantId).toBe(TENANT_A);
    });
  });

  describe('rotate', () => {
    it('issues a new token and revokes the presented one', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(liveRefreshToken());
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-2', sessionId: SESSION_ID });

      const result = await service.rotate('presented-token');

      expect(result.accessToken).toBe('access-jwt');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'refresh-1', tenantId: TENANT_A },
          data: expect.objectContaining({ revokedReason: 'rotated', replacedById: 'refresh-2' }),
        }),
      );
    });

    it('returns a different refresh token than the one presented', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(liveRefreshToken());
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-2', sessionId: SESSION_ID });

      const result = await service.rotate('presented-token');

      expect(result.refreshToken).not.toBe('presented-token');
    });

    it('audits the refresh', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(liveRefreshToken());
      prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-2', sessionId: SESSION_ID });

      await service.rotate('presented-token');

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.TOKEN_REFRESHED, tenantId: TENANT_A }),
      );
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotate('nonsense')).rejects.toBeInstanceOf(AppException);
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        liveRefreshToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.rotate('presented-token')).rejects.toBeInstanceOf(AppException);
    });

    it('rejects a token whose session has been revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        liveRefreshToken({ session: liveSession({ revokedAt: new Date() }) }),
      );

      await expect(service.rotate('presented-token')).rejects.toBeInstanceOf(AppException);
    });

    it('rejects a token belonging to a disabled user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        liveRefreshToken({ user: { id: USER_ID, email: 'x@y.ae', status: 'DISABLED' } }),
      );

      await expect(service.rotate('presented-token')).rejects.toBeInstanceOf(AppException);
    });

    describe('reuse detection', () => {
      beforeEach(() => {
        prisma.refreshToken.findUnique.mockResolvedValue(
          liveRefreshToken({ revokedAt: new Date(), revokedReason: 'rotated' }),
        );
      });

      it('refuses an already-rotated token', async () => {
        await expect(service.rotate('presented-token')).rejects.toBeInstanceOf(AppException);
      });

      it('revokes the whole session, not just the replayed token', async () => {
        await service.rotate('presented-token').catch(() => undefined);

        expect(prisma.session.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: SESSION_ID, tenantId: TENANT_A, revokedAt: null },
            data: expect.objectContaining({ revokedReason: 'refresh_token_reuse_detected' }),
          }),
        );
        expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { sessionId: SESSION_ID, tenantId: TENANT_A, revokedAt: null },
          }),
        );
      });

      it('records a TOKEN_REUSE_DETECTED audit event', async () => {
        await service.rotate('presented-token').catch(() => undefined);

        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.TOKEN_REUSE_DETECTED,
            tenantId: TENANT_A,
            entityId: SESSION_ID,
          }),
        );
      });

      it('never mints a new token for a replayed one', async () => {
        await service.rotate('presented-token').catch(() => undefined);

        expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('revokeAllUserSessions', () => {
    it('can spare the caller own session', async () => {
      prisma.session.findMany.mockResolvedValue([{ id: 'session-2' }]);

      const revoked = await service.revokeAllUserSessions(
        USER_ID,
        TENANT_A,
        'password_changed',
        SESSION_ID,
      );

      expect(revoked).toBe(1);
      expect(prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { id: SESSION_ID }, tenantId: TENANT_A }),
        }),
      );
    });

    it('does nothing when there is nothing live to revoke', async () => {
      prisma.session.findMany.mockResolvedValue([]);

      expect(await service.revokeAllUserSessions(USER_ID, TENANT_A, 'reason')).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

describe('parseDuration', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['8h', 28800],
    ['7d', 604800],
  ])('converts %s to %i seconds', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('rejects an unsupported shape', () => {
    expect(() => parseDuration('forever')).toThrow();
  });
});

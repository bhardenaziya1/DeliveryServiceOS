import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuditAction, PrismaClient } from '@prisma/client';
import { ROLES } from '@vendoros/shared';
import {
  API_PREFIX,
  TEST_PASSWORD,
  cleanupTenants,
  createTenant,
  createTestApp,
  createUser,
  ensureRbacSeeded,
  login,
  type RecordingMailer,
} from './helpers/test-app';

/**
 * The end-to-end authentication contract: sign-up, sign-in, refresh rotation,
 * sign-out, password reset and the audit trail each of them writes.
 *
 * Requires a live Postgres (see docker-compose.yml). Run with `npm run test:e2e`.
 */
describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let mailer: RecordingMailer;
  let prisma: PrismaClient;
  const tenantIds: string[] = [];
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    ({ app, mailer } = await createTestApp());
    prisma = new PrismaClient();
    await ensureRbacSeeded(prisma);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, tenantIds);
    await prisma.$disconnect();
    await app.close();
  });

  describe('registration', () => {
    it('creates a tenant, its first Super Admin and a signed-in session', async () => {
      const email = `founder-${unique()}@newco.ae`;

      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/register`)
        .send({
          tenantName: 'New Co Manpower LLC',
          fullName: 'Founder One',
          email,
          password: 'FounderPassword1',
        })
        .expect(201);

      const { data } = response.body;
      tenantIds.push(data.tenant.id);

      expect(data.user.email).toBe(email);
      expect(data.user.roles).toEqual([ROLES.SUPER_ADMIN]);
      expect(data.tenant.slug).toMatch(/^new-co-manpower-llc/);
      expect(data.accessToken).toEqual(expect.any(String));
      expect(data.refreshToken).toEqual(expect.any(String));
    });

    it('records TENANT_CREATED and USER_REGISTERED in the audit trail', async () => {
      const email = `founder-${unique()}@audited.ae`;

      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/register`)
        .send({
          tenantName: 'Audited Co',
          fullName: 'Founder Two',
          email,
          password: 'FounderPassword1',
        })
        .expect(201);

      const tenantId = response.body.data.tenant.id;
      tenantIds.push(tenantId);

      const actions = (await prisma.auditLog.findMany({ where: { tenantId } })).map(
        (log) => log.action,
      );

      expect(actions).toEqual(
        expect.arrayContaining([
          AuditAction.TENANT_CREATED,
          AuditAction.USER_REGISTERED,
          AuditAction.LOGIN,
        ]),
      );
    });

    it('rejects a duplicate email', async () => {
      const email = `dupe-${unique()}@newco.ae`;
      const body = {
        tenantName: 'First Co',
        fullName: 'Founder',
        email,
        password: 'FounderPassword1',
      };

      const first = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/register`)
        .send(body)
        .expect(201);
      tenantIds.push(first.body.data.tenant.id);

      const second = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/register`)
        .send({ ...body, tenantName: 'Second Co' })
        .expect(409);

      expect(second.body.error.code).toBe('CONFLICT');
    });

    it('rejects a password that does not meet the policy', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/register`)
        .send({
          tenantName: 'Weak Co',
          fullName: 'Founder',
          email: `weak-${unique()}@newco.ae`,
          password: 'short',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fieldErrors).toHaveProperty('password');
    });
  });

  describe('login and the current-user endpoint', () => {
    let email: string;
    let tenantId: string;

    beforeAll(async () => {
      const tenant = await createTenant(prisma, 'login-suite');
      tenantId = tenant.id;
      tenantIds.push(tenantId);
      email = `ops-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId, email, roles: [ROLES.OPS_MANAGER] });
    });

    it('returns the user, tenant and resolved permissions', async () => {
      const session = await login(app, email);

      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      const { data } = response.body;
      expect(data.user.email).toBe(email);
      expect(data.user.roles).toEqual([ROLES.OPS_MANAGER]);
      expect(data.user.permissions).toEqual(expect.arrayContaining(['clients:read']));
      expect(data.user.permissions).not.toContain('clients:delete');
      expect(data.tenant.id).toBe(tenantId);
    });

    it('never includes the password hash', async () => {
      const session = await login(app, email);

      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$argon2/);
    });

    it('rejects a wrong password with UNAUTHORIZED', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/login`)
        .send({ email, password: 'WrongPassword123' })
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('answers an unknown email exactly like a wrong password', async () => {
      const unknown = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: `ghost-${unique()}@tenant.ae`, password: TEST_PASSWORD })
        .expect(401);

      expect(unknown.body.error.message).toBe('Invalid email or password');
    });

    it('records LOGIN and LOGIN_FAILED events', async () => {
      await login(app, email);
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/login`)
        .send({ email, password: 'WrongPassword123' })
        .expect(401);

      const actions = (await prisma.auditLog.findMany({ where: { tenantId } })).map(
        (log) => log.action,
      );

      expect(actions).toEqual(
        expect.arrayContaining([AuditAction.LOGIN, AuditAction.LOGIN_FAILED]),
      );
    });
  });

  describe('unauthorised access', () => {
    it.each([
      ['GET', '/auth/me'],
      ['GET', '/clients'],
      ['GET', '/projects'],
      ['GET', '/users'],
      ['GET', '/tenant'],
      ['GET', '/roles'],
      ['GET', '/audit-logs'],
    ])('rejects %s %s without a token', async (method, path) => {
      const response = await request(app.getHttpServer())
        [method.toLowerCase() as 'get'](`${API_PREFIX}${path}`)
        .expect(401);

      expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('rejects a malformed bearer token', async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
      // A hand-rolled HS256 token with a plausible payload and a bogus signature.
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({ sub: 'user-1', tenantId: 'tenant-1', sid: 'session-1' }),
      ).toString('base64url');

      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${header}.${payload}.forged`)
        .expect(401);
    });

    it('leaves health endpoints public', async () => {
      await request(app.getHttpServer()).get(`${API_PREFIX}/health`).expect(200);
    });
  });

  describe('refresh token rotation', () => {
    let email: string;
    let tenantId: string;

    beforeAll(async () => {
      const tenant = await createTenant(prisma, 'refresh-suite');
      tenantId = tenant.id;
      tenantIds.push(tenantId);
      email = `refresh-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId, email, roles: [ROLES.VIEWER] });
    });

    it('exchanges a refresh token for a brand-new pair', async () => {
      const session = await login(app, email);

      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      expect(response.body.data.refreshToken).not.toBe(session.refreshToken);
      expect(response.body.data.accessToken).toEqual(expect.any(String));

      // The new access token works.
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${response.body.data.accessToken}`)
        .expect(200);
    });

    it('retires the presented token so it cannot be used twice', async () => {
      const session = await login(app, email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('kills the whole session when a rotated token is replayed', async () => {
      const session = await login(app, email);

      const rotated = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      // Replay the spent token - this is what a stolen-token attack looks like.
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: session.refreshToken })
        .expect(401);

      // The legitimate holder's newest token is dead too: the session is gone.
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: rotated.body.data.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${rotated.body.data.accessToken}`)
        .expect(401);
    });

    it('records TOKEN_REFRESHED and TOKEN_REUSE_DETECTED', async () => {
      const actions = (await prisma.auditLog.findMany({ where: { tenantId } })).map(
        (log) => log.action,
      );

      expect(actions).toEqual(
        expect.arrayContaining([AuditAction.TOKEN_REFRESHED, AuditAction.TOKEN_REUSE_DETECTED]),
      );
    });

    it('stores refresh tokens hashed, never in the clear', async () => {
      const session = await login(app, email);

      const stored = await prisma.refreshToken.findMany({
        where: { tenantId },
        select: { tokenHash: true },
      });

      expect(stored.length).toBeGreaterThan(0);
      expect(stored.some((row) => row.tokenHash === session.refreshToken)).toBe(false);
    });

    it('rejects an unknown refresh token', async () => {
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });

    it('gives a remember-me session a longer life than a normal one', async () => {
      const normal = await login(app, email, TEST_PASSWORD, false);
      const remembered = await login(app, email, TEST_PASSWORD, true);

      const [normalSession, rememberedSession] = await Promise.all([
        prisma.session.findUniqueOrThrow({ where: { id: normal.sessionId } }),
        prisma.session.findUniqueOrThrow({ where: { id: remembered.sessionId } }),
      ]);

      expect(rememberedSession.rememberMe).toBe(true);
      expect(normalSession.rememberMe).toBe(false);
      expect(rememberedSession.expiresAt.getTime()).toBeGreaterThan(
        normalSession.expiresAt.getTime(),
      );
    });
  });

  describe('logout', () => {
    let email: string;
    let tenantId: string;

    beforeAll(async () => {
      const tenant = await createTenant(prisma, 'logout-suite');
      tenantId = tenant.id;
      tenantIds.push(tenantId);
      email = `logout-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId, email, roles: [ROLES.VIEWER] });
    });

    it('invalidates the access token immediately, not at its expiry', async () => {
      const session = await login(app, email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(401);
    });

    it('invalidates the refresh token too', async () => {
      const session = await login(app, email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('leaves other sessions alone by default', async () => {
      const first = await login(app, email);
      const second = await login(app, email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${first.accessToken}`)
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(200);
    });

    it('signs out everywhere when asked', async () => {
      const first = await login(app, email);
      const second = await login(app, email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${first.accessToken}`)
        .send({ allSessions: true })
        .expect(200);

      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(401);
    });

    it('records a LOGOUT audit event', async () => {
      const actions = (await prisma.auditLog.findMany({ where: { tenantId } })).map(
        (log) => log.action,
      );
      expect(actions).toContain(AuditAction.LOGOUT);
    });
  });

  describe('session management', () => {
    it('lists the caller own sessions and marks the current one', async () => {
      const tenant = await createTenant(prisma, 'sessions-suite');
      tenantIds.push(tenant.id);
      const email = `sessions-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId: tenant.id, email, roles: [ROLES.VIEWER] });

      const first = await login(app, email);
      await login(app, email);

      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/sessions`)
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      const current = response.body.data.filter((s: { current: boolean }) => s.current);
      expect(current).toHaveLength(1);
      expect(current[0].id).toBe(first.sessionId);
    });

    it('revokes a named session', async () => {
      const tenant = await createTenant(prisma, 'revoke-suite');
      tenantIds.push(tenant.id);
      const email = `revoke-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId: tenant.id, email, roles: [ROLES.VIEWER] });

      const keep = await login(app, email);
      const drop = await login(app, email);

      await request(app.getHttpServer())
        .delete(`${API_PREFIX}/auth/sessions/${drop.sessionId}`)
        .set('Authorization', `Bearer ${keep.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${drop.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${keep.accessToken}`)
        .expect(200);
    });
  });

  describe('password reset', () => {
    it('accepts an unknown address without saying so', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/forgot-password`)
        .send({ email: `nobody-${unique()}@nowhere.ae` })
        .expect(202);

      expect(response.body.data.status).toBe('accepted');
    });

    it('resets the password, signs every session out and allows the new one', async () => {
      const tenant = await createTenant(prisma, 'reset-suite');
      tenantIds.push(tenant.id);
      const email = `reset-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId: tenant.id, email, roles: [ROLES.VIEWER] });

      const before = await login(app, email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/forgot-password`)
        .send({ email })
        .expect(202);

      // Exactly what a real user does: follow the link that was emailed.
      const rawToken = mailer.lastTokenFor(email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/reset-password`)
        .send({ token: rawToken, password: 'BrandNewPassword1' })
        .expect(200);

      // Old session is dead, old password refused, new password works.
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${before.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/login`)
        .send({ email, password: TEST_PASSWORD })
        .expect(401);
      await login(app, email, 'BrandNewPassword1');
    });

    it('refuses to use a reset token twice', async () => {
      const tenant = await createTenant(prisma, 'reset-once-suite');
      tenantIds.push(tenant.id);
      const email = `once-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId: tenant.id, email, roles: [ROLES.VIEWER] });

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/forgot-password`)
        .send({ email })
        .expect(202);

      const rawToken = mailer.lastTokenFor(email);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/reset-password`)
        .send({ token: rawToken, password: 'FirstNewPassword1' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/reset-password`)
        .send({ token: rawToken, password: 'SecondNewPassword1' })
        .expect(400);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuditAction, PrismaClient } from '@prisma/client';
import { ROLES, type RoleKey } from '@vendoros/shared';
import {
  API_PREFIX,
  cleanupTenants,
  createTenant,
  createTestApp,
  createUser,
  ensureRbacSeeded,
  login,
  type LoggedIn,
  type RecordingMailer,
} from './helpers/test-app';

/**
 * Role permissions, enforced at the API rather than merely reflected in the UI.
 *
 * The frontend hides what a user cannot do; this suite is the proof that
 * unhiding it in devtools achieves nothing.
 */
describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let mailer: RecordingMailer;
  let prisma: PrismaClient;
  let tenantId: string;

  const sessions = new Map<RoleKey, LoggedIn>();
  const as = (role: RoleKey) => ({ Authorization: `Bearer ${sessions.get(role)!.accessToken}` });

  const SEEDED_ROLES: RoleKey[] = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.OPS_MANAGER,
    ROLES.HR_COMPLIANCE,
    ROLES.FLEET_MANAGER,
    ROLES.FINANCE_MANAGER,
    ROLES.ACCOUNTANT,
    ROLES.SUPERVISOR,
    ROLES.VIEWER,
  ];

  beforeAll(async () => {
    ({ app, mailer } = await createTestApp());
    prisma = new PrismaClient();
    await ensureRbacSeeded(prisma);

    const tenant = await createTenant(prisma, 'rbac-suite');
    tenantId = tenant.id;

    for (const role of SEEDED_ROLES) {
      const email = `${role.toLowerCase()}-${tenant.slug}@tenant.ae`;
      await createUser(prisma, { tenantId, email, roles: [role] });
      sessions.set(role, await login(app, email));
    }
  });

  afterAll(async () => {
    await cleanupTenants(prisma, [tenantId]);
    await prisma.$disconnect();
    await app.close();
  });

  describe('client endpoints', () => {
    const newClient = (name: string) => ({
      legalName: name,
      status: 'ACTIVE',
      primaryContactName: 'Contact',
      primaryContactEmail: 'contact@tenant.ae',
      primaryContactPhone: '+971501234567',
    });

    it.each([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPS_MANAGER])(
      '%s can create a client',
      async (role) => {
        await request(app.getHttpServer())
          .post(`${API_PREFIX}/clients`)
          .set(as(role))
          .send(newClient(`Created by ${role}`))
          .expect(201);
      },
    );

    it.each([
      ROLES.HR_COMPLIANCE,
      ROLES.FLEET_MANAGER,
      ROLES.FINANCE_MANAGER,
      ROLES.ACCOUNTANT,
      ROLES.SUPERVISOR,
      ROLES.VIEWER,
    ])('%s cannot create a client', async (role) => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/clients`)
        .set(as(role))
        .send(newClient(`Should not exist (${role})`))
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    // HR/Compliance is scoped to people and documents, not the commercial
    // relationship, so it deliberately has no `clients:read`.
    it.each([
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.OPS_MANAGER,
      ROLES.FLEET_MANAGER,
      ROLES.FINANCE_MANAGER,
      ROLES.ACCOUNTANT,
      ROLES.SUPERVISOR,
      ROLES.VIEWER,
    ])('%s can read clients', async (role) => {
      await request(app.getHttpServer()).get(`${API_PREFIX}/clients`).set(as(role)).expect(200);
    });

    it('HR/Compliance cannot read clients', async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/clients`)
        .set(as(ROLES.HR_COMPLIANCE))
        .expect(403);
    });

    it.each([ROLES.SUPER_ADMIN, ROLES.ADMIN])('%s can delete a client', async (role) => {
      const created = await request(app.getHttpServer())
        .post(`${API_PREFIX}/clients`)
        .set(as(ROLES.ADMIN))
        .send(newClient(`Deletable by ${role}`))
        .expect(201);

      await request(app.getHttpServer())
        .delete(`${API_PREFIX}/clients/${created.body.data.id}`)
        .set(as(role))
        .expect(204);
    });

    it('an Operations Manager can update but not delete a client', async () => {
      const created = await request(app.getHttpServer())
        .post(`${API_PREFIX}/clients`)
        .set(as(ROLES.OPS_MANAGER))
        .send(newClient('Ops owned'))
        .expect(201);

      await request(app.getHttpServer())
        .put(`${API_PREFIX}/clients/${created.body.data.id}`)
        .set(as(ROLES.OPS_MANAGER))
        .send({ legalName: 'Ops renamed' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`${API_PREFIX}/clients/${created.body.data.id}`)
        .set(as(ROLES.OPS_MANAGER))
        .expect(403);
    });
  });

  describe('tenant settings', () => {
    it('only a Super Admin can change them', async () => {
      await request(app.getHttpServer())
        .patch(`${API_PREFIX}/tenant`)
        .set(as(ROLES.SUPER_ADMIN))
        .send({ name: 'Renamed by Super Admin' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${API_PREFIX}/tenant`)
        .set(as(ROLES.ADMIN))
        .send({ name: 'Renamed by Admin' })
        .expect(403);
    });

    it('every role can read them', async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/tenant`)
        .set(as(ROLES.VIEWER))
        .expect(200);
    });
  });

  describe('the audit trail', () => {
    it.each([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_COMPLIANCE, ROLES.FINANCE_MANAGER])(
      '%s can read it',
      async (role) => {
        await request(app.getHttpServer())
          .get(`${API_PREFIX}/audit-logs`)
          .set(as(role))
          .expect(200);
      },
    );

    it.each([ROLES.OPS_MANAGER, ROLES.ACCOUNTANT, ROLES.SUPERVISOR, ROLES.VIEWER])(
      '%s cannot read it',
      async (role) => {
        await request(app.getHttpServer())
          .get(`${API_PREFIX}/audit-logs`)
          .set(as(role))
          .expect(403);
      },
    );
  });

  describe('role assignment', () => {
    let targetUserId: string;

    beforeEach(async () => {
      const email = `target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@tenant.ae`;
      const user = await createUser(prisma, { tenantId, email, roles: [ROLES.VIEWER] });
      targetUserId = user.id;
    });

    it('an Admin can promote a Viewer to Supervisor', async () => {
      const response = await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${targetUserId}/roles`)
        .set(as(ROLES.ADMIN))
        .send({ roleKeys: [ROLES.SUPERVISOR] })
        .expect(200);

      expect(response.body.data.roles).toEqual([ROLES.SUPERVISOR]);
    });

    it('an Admin cannot mint a Super Admin', async () => {
      // The escalation path that matters: without this rule, any Admin could
      // grant themselves - via a second account - unrestricted access.
      const response = await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${targetUserId}/roles`)
        .set(as(ROLES.ADMIN))
        .send({ roleKeys: [ROLES.SUPER_ADMIN] })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('a Super Admin can', async () => {
      await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${targetUserId}/roles`)
        .set(as(ROLES.SUPER_ADMIN))
        .send({ roleKeys: [ROLES.SUPER_ADMIN] })
        .expect(200);
    });

    it('a Viewer cannot assign roles at all', async () => {
      await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${targetUserId}/roles`)
        .set(as(ROLES.VIEWER))
        .send({ roleKeys: [ROLES.ADMIN] })
        .expect(403);
    });

    it('nobody can promote themselves', async () => {
      const adminId = sessions.get(ROLES.ADMIN)!.userId;

      await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${adminId}/roles`)
        .set(as(ROLES.ADMIN))
        .send({ roleKeys: [ROLES.ADMIN, ROLES.SUPER_ADMIN] })
        .expect(403);
    });

    it('a role change takes effect immediately by revoking the target sessions', async () => {
      const email = `demoted-${Date.now()}@tenant.ae`;
      const user = await createUser(prisma, { tenantId, email, roles: [ROLES.OPS_MANAGER] });
      const session = await login(app, email);

      // Their permissions allow client creation right now.
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/clients`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          legalName: 'Before demotion',
          status: 'ACTIVE',
          primaryContactName: 'Contact',
          primaryContactEmail: 'contact@tenant.ae',
          primaryContactPhone: '+971501234567',
        })
        .expect(201);

      await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${user.id}/roles`)
        .set(as(ROLES.ADMIN))
        .send({ roleKeys: [ROLES.VIEWER] })
        .expect(200);

      // The old access token is dead - not merely reduced in scope.
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(401);

      // And after signing in again, the new role is what applies.
      const renewed = await login(app, email);
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/clients`)
        .set('Authorization', `Bearer ${renewed.accessToken}`)
        .send({
          legalName: 'After demotion',
          status: 'ACTIVE',
          primaryContactName: 'Contact',
          primaryContactEmail: 'contact@tenant.ae',
          primaryContactPhone: '+971501234567',
        })
        .expect(403);
    });

    it('records a ROLES_CHANGED audit event carrying both role sets', async () => {
      await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${targetUserId}/roles`)
        .set(as(ROLES.ADMIN))
        .send({ roleKeys: [ROLES.ACCOUNTANT] })
        .expect(200);

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId, entityId: targetUserId, action: AuditAction.ROLES_CHANGED },
        orderBy: { createdAt: 'desc' },
      });

      expect(entry.before).toEqual({ roles: [ROLES.VIEWER] });
      expect(entry.after).toEqual({ roles: [ROLES.ACCOUNTANT] });
      expect(entry.actorEmail).toContain('admin');
    });
  });

  describe('invitations', () => {
    it('an HR/Compliance user can invite, and the invitee gets the invited roles', async () => {
      const email = `invited-${Date.now()}@tenant.ae`;

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/users/invitations`)
        .set(as(ROLES.HR_COMPLIANCE))
        .send({ email, fullName: 'Invited Person', roleKeys: [ROLES.SUPERVISOR] })
        .expect(201);

      const token = mailer.lastTokenFor(email);

      const preview = await request(app.getHttpServer())
        .get(`${API_PREFIX}/invitations/${token}`)
        .expect(200);
      expect(preview.body.data.roles).toEqual([ROLES.SUPERVISOR]);

      const accepted = await request(app.getHttpServer())
        .post(`${API_PREFIX}/invitations/accept`)
        .send({ token, fullName: 'Invited Person', password: 'InvitedPassword1' })
        .expect(201);

      expect(accepted.body.data.user.roles).toEqual([ROLES.SUPERVISOR]);
      expect(accepted.body.data.tenant.id).toBe(tenantId);
    });

    it('an invitee cannot upgrade themselves on the way in', async () => {
      const email = `sneaky-${Date.now()}@tenant.ae`;

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/users/invitations`)
        .set(as(ROLES.ADMIN))
        .send({ email, fullName: 'Sneaky Person', roleKeys: [ROLES.VIEWER] })
        .expect(201);

      const token = mailer.lastTokenFor(email);

      const accepted = await request(app.getHttpServer())
        .post(`${API_PREFIX}/invitations/accept`)
        // The extra fields are not in the schema and must be ignored outright.
        .send({
          token,
          fullName: 'Sneaky Person',
          password: 'SneakyPassword1',
          roleKeys: [ROLES.SUPER_ADMIN],
          tenantId: 'some-other-tenant',
        })
        .expect(201);

      expect(accepted.body.data.user.roles).toEqual([ROLES.VIEWER]);
      expect(accepted.body.data.tenant.id).toBe(tenantId);
    });

    it('an Admin cannot invite someone as a Super Admin', async () => {
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/users/invitations`)
        .set(as(ROLES.ADMIN))
        .send({
          email: `escalate-${Date.now()}@tenant.ae`,
          fullName: 'Escalation Attempt',
          roleKeys: [ROLES.SUPER_ADMIN],
        })
        .expect(403);
    });

    it('a Viewer cannot invite anyone', async () => {
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/users/invitations`)
        .set(as(ROLES.VIEWER))
        .send({
          email: `nope-${Date.now()}@tenant.ae`,
          fullName: 'Nope',
          roleKeys: [ROLES.VIEWER],
        })
        .expect(403);
    });

    it('records a USER_INVITED audit event', async () => {
      const email = `audited-invite-${Date.now()}@tenant.ae`;

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/users/invitations`)
        .set(as(ROLES.ADMIN))
        .send({ email, fullName: 'Audited Invite', roleKeys: [ROLES.VIEWER] })
        .expect(201);

      const entry = await prisma.auditLog.findFirst({
        where: { tenantId, action: AuditAction.USER_INVITED },
        orderBy: { createdAt: 'desc' },
      });

      expect(entry).not.toBeNull();
      expect(entry?.after).toMatchObject({ email });
    });
  });

  describe('own profile', () => {
    it('a Viewer can rename themselves without any admin permission', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${API_PREFIX}/users/me`)
        .set(as(ROLES.VIEWER))
        .send({ fullName: 'Renamed Viewer' })
        .expect(200);

      expect(response.body.data.fullName).toBe('Renamed Viewer');
    });

    it('a Viewer still cannot list other users', async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/users`)
        .set(as(ROLES.VIEWER))
        .expect(403);
    });
  });
});

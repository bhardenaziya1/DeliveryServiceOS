import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ROLES } from '@vendoros/shared';
import {
  API_PREFIX,
  cleanupTenants,
  createTenant,
  createTestApp,
  createUser,
  ensureRbacSeeded,
  login,
  type LoggedIn,
} from './helpers/test-app';

/**
 * Tenant A must not be able to read, change or even learn of Tenant B's data.
 *
 * Requires a live Postgres reachable via DATABASE_URL (see docker-compose.yml)
 * with migrations applied. Run with `npm run test:e2e`.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let tenantAId: string;
  let tenantBId: string;
  let ownerA: LoggedIn;
  let ownerB: LoggedIn;

  let clientAId: string;
  let projectAId: string;
  let clientBId: string;
  let userBId: string;

  const asA = (token = ownerA.accessToken) => ({ Authorization: `Bearer ${token}` });
  const asB = () => ({ Authorization: `Bearer ${ownerB.accessToken}` });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    prisma = new PrismaClient();
    await ensureRbacSeeded(prisma);

    const tenantA = await createTenant(prisma, 'tenant-a');
    const tenantB = await createTenant(prisma, 'tenant-b');
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const emailA = `owner-${tenantA.slug}@tenant-a.ae`;
    const emailB = `owner-${tenantB.slug}@tenant-b.ae`;

    await createUser(prisma, { tenantId: tenantAId, email: emailA, roles: [ROLES.SUPER_ADMIN] });
    const createdB = await createUser(prisma, {
      tenantId: tenantBId,
      email: emailB,
      roles: [ROLES.SUPER_ADMIN],
    });
    userBId = createdB.id;

    ownerA = await login(app, emailA);
    ownerB = await login(app, emailB);

    const clientA = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(asA())
      .send({
        legalName: 'Tenant A Client',
        status: 'ACTIVE',
        primaryContactName: 'Contact A',
        primaryContactEmail: 'contact@tenant-a.ae',
        primaryContactPhone: '+971501234567',
      })
      .expect(201);
    clientAId = clientA.body.data.id;

    const projectA = await request(app.getHttpServer())
      .post(`${API_PREFIX}/projects`)
      .set(asA())
      .send({
        clientId: clientAId,
        name: 'Tenant A Project',
        code: `TA-${Date.now()}`,
        status: 'ACTIVE',
        startDate: '2026-01-01',
      })
      .expect(201);
    projectAId = projectA.body.data.id;

    const clientB = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(asB())
      .send({
        legalName: 'Tenant B Client',
        status: 'ACTIVE',
        primaryContactName: 'Contact B',
        primaryContactEmail: 'contact@tenant-b.ae',
        primaryContactPhone: '+971501234568',
      })
      .expect(201);
    clientBId = clientB.body.data.id;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, [tenantAId, tenantBId]);
    await prisma.$disconnect();
    await app.close();
  });

  describe('reads', () => {
    it("a tenant's list contains only its own clients", async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/clients`)
        .set(asB())
        .expect(200);

      const ids = response.body.data.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(clientBId);
      expect(ids).not.toContain(clientAId);
    });

    it("a tenant's list contains only its own projects", async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/projects`)
        .set(asB())
        .expect(200);

      const ids = response.body.data.items.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(projectAId);
    });

    it("404s a direct lookup of another tenant's client", async () => {
      // 404 rather than 403 on purpose: a 403 would confirm the id exists.
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/clients/${clientAId}`)
        .set(asB())
        .expect(404);
    });

    it("404s a direct lookup of another tenant's project", async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/projects/${projectAId}`)
        .set(asB())
        .expect(404);
    });

    it("404s a direct lookup of another tenant's user", async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/users/${userBId}`)
        .set(asA())
        .expect(404);
    });

    it("a tenant's user list never includes another tenant's users", async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/users`)
        .set(asA())
        .expect(200);

      const tenantIds: string[] = response.body.data.items.map(
        (item: { tenantId: string }) => item.tenantId,
      );
      expect(new Set(tenantIds)).toEqual(new Set([tenantAId]));
    });

    it('a search cannot reach across tenants', async () => {
      // A search that ORs over columns is the classic way an unscoped branch
      // sneaks in; this asserts the result stays inside the caller's tenant.
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/clients`)
        .query({ search: 'Tenant A Client' })
        .set(asB())
        .expect(200);

      expect(response.body.data.items).toHaveLength(0);
    });

    it("the audit trail shows only the caller's own tenant", async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/audit-logs`)
        .set(asB())
        .expect(200);

      const tenantIds: string[] = response.body.data.items.map(
        (item: { tenantId: string }) => item.tenantId,
      );
      expect(tenantIds.every((id) => id === tenantBId)).toBe(true);
    });
  });

  describe('writes', () => {
    it("cannot update another tenant's client", async () => {
      await request(app.getHttpServer())
        .put(`${API_PREFIX}/clients/${clientAId}`)
        .set(asB())
        .send({ legalName: 'Hijacked' })
        .expect(404);

      const unchanged = await prisma.client.findUniqueOrThrow({ where: { id: clientAId } });
      expect(unchanged.legalName).toBe('Tenant A Client');
    });

    it("cannot delete another tenant's client", async () => {
      await request(app.getHttpServer())
        .delete(`${API_PREFIX}/clients/${clientAId}`)
        .set(asB())
        .expect(404);

      expect(await prisma.client.count({ where: { id: clientAId } })).toBe(1);
    });

    it("cannot change another tenant's user roles", async () => {
      await request(app.getHttpServer())
        .put(`${API_PREFIX}/users/${userBId}/roles`)
        .set(asA())
        .send({ roleKeys: [ROLES.VIEWER] })
        .expect(404);
    });

    it("cannot revoke another tenant's user sessions", async () => {
      await request(app.getHttpServer())
        .delete(`${API_PREFIX}/users/${userBId}/sessions`)
        .set(asA())
        .expect(404);

      // Tenant B's session is still usable.
      await request(app.getHttpServer()).get(`${API_PREFIX}/auth/me`).set(asB()).expect(200);
    });

    it("cannot create a project against another tenant's client", async () => {
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/projects`)
        .set(asB())
        .send({
          clientId: clientAId,
          name: 'Cross-tenant project',
          code: `XT-${Date.now()}`,
          status: 'ACTIVE',
          startDate: '2026-01-01',
        })
        .expect(404);
    });
  });

  describe('tenant id supplied by the client', () => {
    it('is refused in the request body', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/clients`)
        .set(asB())
        .send({
          tenantId: tenantAId,
          legalName: 'Planted in Tenant A',
          status: 'ACTIVE',
          primaryContactName: 'Attacker',
          primaryContactEmail: 'attacker@tenant-b.ae',
          primaryContactPhone: '+971501234569',
        })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(await prisma.client.count({ where: { legalName: 'Planted in Tenant A' } })).toBe(0);
    });

    it('is refused in the query string', async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/clients`)
        .query({ tenantId: tenantAId })
        .set(asB())
        .expect(403);
    });

    it('is refused in an x-tenant-id header', async () => {
      await request(app.getHttpServer())
        .get(`${API_PREFIX}/clients`)
        .set({ ...asB(), 'x-tenant-id': tenantAId })
        .expect(403);
    });

    it('is ignored - not honoured - when it matches the caller own tenant', async () => {
      // A client echoing back its own tenant id is harmless; it must simply
      // have no effect rather than being treated as an instruction.
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/clients`)
        .set(asB())
        .send({
          tenantId: tenantBId,
          legalName: 'Echoed Tenant Id',
          status: 'ACTIVE',
          primaryContactName: 'Contact B',
          primaryContactEmail: 'echo@tenant-b.ae',
          primaryContactPhone: '+971501234570',
        })
        .expect(201);

      expect(response.body.data.tenantId).toBe(tenantBId);
    });
  });

  describe('tokens', () => {
    it("tenant A's access token is not accepted as tenant B", async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set(asA())
        .expect(200);

      expect(response.body.data.tenant.id).toBe(tenantAId);
      expect(response.body.data.tenant.id).not.toBe(tenantBId);
    });

    it("tenant A cannot rotate tenant B's refresh token into its own session", async () => {
      const rotated = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .send({ refreshToken: ownerB.refreshToken })
        .expect(200);

      // The token identifies the tenant; it cannot be redirected by whoever
      // presents it. Tenant B keeps its new pair.
      expect(rotated.body.data.tenant.id).toBe(tenantBId);
      ownerB.refreshToken = rotated.body.data.refreshToken;
      ownerB.accessToken = rotated.body.data.accessToken;
    });
  });
});

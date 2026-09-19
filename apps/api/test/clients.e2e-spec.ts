import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ClientStatus, PrismaClient } from '@prisma/client';
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
 * Client CRUD through the real pipeline.
 *
 * Cross-tenant guarantees live in `tenant-isolation.e2e-spec.ts`; this suite
 * is about the endpoints themselves.
 */
describe('Clients (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenantId: string;
  let owner: LoggedIn;

  const auth = () => ({ Authorization: `Bearer ${owner.accessToken}` });

  const validClient = (overrides: Record<string, unknown> = {}) => ({
    legalName: 'Swift Logistics FZ-LLC',
    status: ClientStatus.ACTIVE,
    primaryContactName: 'Ahmed Al Mazrouei',
    primaryContactEmail: 'ops@swiftlogistics.ae',
    primaryContactPhone: '+971501234567',
    ...overrides,
  });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    prisma = new PrismaClient();
    await ensureRbacSeeded(prisma);

    const tenant = await createTenant(prisma, 'clients-suite');
    tenantId = tenant.id;

    const email = `owner-${tenant.slug}@tenant.ae`;
    await createUser(prisma, { tenantId, email, roles: [ROLES.SUPER_ADMIN] });
    owner = await login(app, email);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, [tenantId]);
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects unauthenticated requests with the standard error envelope', async () => {
    const response = await request(app.getHttpServer()).get(`${API_PREFIX}/clients`).expect(401);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
      meta: { path: `${API_PREFIX}/clients` },
    });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('creates a client scoped to the caller tenant', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(auth())
      .send(validClient())
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.tenantId).toBe(tenantId);
  });

  it('validates the request body against the shared schema', async () => {
    const response = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(auth())
      .send(validClient({ primaryContactEmail: 'not-an-email' }))
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fieldErrors).toHaveProperty('primaryContactEmail');
  });

  it('reads back a client it just created', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(auth())
      .send(validClient({ legalName: 'Readback Logistics' }))
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/clients/${created.body.data.id}`)
      .set(auth())
      .expect(200);

    expect(response.body.data.legalName).toBe('Readback Logistics');
  });

  it('updates a client and returns the new state', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(auth())
      .send(validClient({ legalName: 'Before Rename' }))
      .expect(201);

    const response = await request(app.getHttpServer())
      .put(`${API_PREFIX}/clients/${created.body.data.id}`)
      .set(auth())
      .send({ legalName: 'After Rename' })
      .expect(200);

    expect(response.body.data.legalName).toBe('After Rename');
  });

  it('404s an id that does not exist', async () => {
    await request(app.getHttpServer())
      .get(`${API_PREFIX}/clients/cnonexistentclient00000001`)
      .set(auth())
      .expect(404);
  });

  it('refuses to delete a client that still has projects', async () => {
    const client = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(auth())
      .send(validClient({ legalName: 'Has Projects' }))
      .expect(201);

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/projects`)
      .set(auth())
      .send({
        clientId: client.body.data.id,
        name: 'Blocking Project',
        code: `BLK-${Date.now()}`,
        status: 'ACTIVE',
        startDate: '2026-01-01',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .delete(`${API_PREFIX}/clients/${client.body.data.id}`)
      .set(auth())
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('deletes a client that has none', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API_PREFIX}/clients`)
      .set(auth())
      .send(validClient({ legalName: 'Disposable Client' }))
      .expect(201);

    await request(app.getHttpServer())
      .delete(`${API_PREFIX}/clients/${created.body.data.id}`)
      .set(auth())
      .expect(204);

    await request(app.getHttpServer())
      .get(`${API_PREFIX}/clients/${created.body.data.id}`)
      .set(auth())
      .expect(404);
  });
});

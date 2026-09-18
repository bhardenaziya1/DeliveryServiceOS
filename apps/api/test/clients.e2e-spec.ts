import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { ClientStatus, PrismaClient, UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// Requires a live Postgres reachable via DATABASE_URL (see docker-compose.yml)
// and migrations applied: `docker compose up -d postgres && npm run prisma:migrate --workspace=apps/api`.
// Not executed in sandboxes without a database - see docs/sprint-1.md.
describe('Clients (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenantAToken: string;
  let tenantBToken: string;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = new PrismaClient();
    const passwordHash = await argon2.hash('Password123!');

    const tenantA = await prisma.tenant.create({
      data: { name: 'Tenant A', slug: `tenant-a-${Date.now()}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: 'Tenant B', slug: `tenant-b-${Date.now()}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: 'owner@tenant-a.ae',
        passwordHash,
        fullName: 'Tenant A Owner',
        role: UserRole.OWNER,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: 'owner@tenant-b.ae',
        passwordHash,
        fullName: 'Tenant B Owner',
        role: UserRole.OWNER,
      },
    });

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@tenant-a.ae', password: 'Password123!' });
    tenantAToken = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'owner@tenant-b.ae', password: 'Password123!' });
    tenantBToken = loginB.body.accessToken;
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.client.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/v1/clients').expect(401);
  });

  it('creates a client scoped to the caller tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({
        legalName: 'Swift Logistics FZ-LLC',
        status: ClientStatus.ACTIVE,
        primaryContactName: 'Ahmed Al Mazrouei',
        primaryContactEmail: 'ops@swiftlogistics.ae',
        primaryContactPhone: '+971501234567',
      })
      .expect(201);

    expect(response.body.tenantId).toBe(tenantAId);
  });

  it('never exposes another tenant client, even by direct id lookup', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .send({
        legalName: 'Tenant A Only Client',
        status: ClientStatus.ACTIVE,
        primaryContactName: 'Contact',
        primaryContactEmail: 'contact@tenant-a.ae',
        primaryContactPhone: '+971501234568',
      });

    await request(app.getHttpServer())
      .get(`/api/v1/clients/${created.body.id}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(404);

    const listForTenantB = await request(app.getHttpServer())
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(200);

    expect(listForTenantB.body.items).toHaveLength(0);
  });
});

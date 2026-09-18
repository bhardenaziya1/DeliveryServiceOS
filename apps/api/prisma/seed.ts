import { ClientStatus, PrismaClient, ProjectStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-vendor' },
    update: {},
    create: {
      name: 'Demo Manpower & Fleet Services LLC',
      slug: 'demo-vendor',
    },
  });

  const passwordHash = await argon2.hash('Password123!');

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'owner@demo-vendor.ae' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'owner@demo-vendor.ae',
      passwordHash,
      fullName: 'Demo Owner',
      role: UserRole.OWNER,
    },
  });

  const client = await prisma.client.upsert({
    where: { id: 'demo-client-seed-id' },
    update: {},
    create: {
      id: 'demo-client-seed-id',
      tenantId: tenant.id,
      legalName: 'Swift Logistics FZ-LLC',
      tradeName: 'Swift Logistics',
      status: ClientStatus.ACTIVE,
      primaryContactName: 'Ahmed Al Mazrouei',
      primaryContactEmail: 'ops@swiftlogistics.ae',
      primaryContactPhone: '+971501234567',
      billingAddress: 'Dubai Silicon Oasis, Dubai, UAE',
    },
  });

  await prisma.project.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SWIFT-DXB-01' } },
    update: {},
    create: {
      tenantId: tenant.id,
      clientId: client.id,
      name: 'Dubai Last-Mile Delivery',
      code: 'SWIFT-DXB-01',
      status: ProjectStatus.ACTIVE,
      startDate: new Date('2026-01-01'),
      description: 'Rider supply for last-mile delivery across Dubai zones.',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded tenant "${tenant.slug}" with demo login owner@demo-vendor.ae / Password123!`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

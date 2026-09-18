import { ClientStatus, ProjectStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { type Seeder } from './types';

const DEFAULT_OWNER_EMAIL = 'owner@demo-vendor.ae';
const DEFAULT_OWNER_PASSWORD = 'Password123!';
// Stable, cuid-shaped so it passes the same validation as a generated id
// (see createProjectSchema.clientId).
const DEMO_CLIENT_ID = 'cdemoseedclient000000001';

/**
 * The minimum data needed to log in and see a populated shell: one tenant, one
 * owner, one client, one project.
 *
 * This is deliberately tiny. Volume data for performance work belongs in a
 * separate, explicitly-invoked generator once the business modules exist - not
 * here, where it would run on every developer's machine and in CI.
 */
export const baselineSeeder: Seeder = {
  name: 'baseline',
  description: 'Demo tenant, owner user, and one client/project to log in against',
  async run({ prisma, log }) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: 'demo-vendor' },
      update: {},
      create: {
        name: 'Demo Manpower & Fleet Services LLC',
        slug: 'demo-vendor',
      },
    });
    log(`tenant: ${tenant.name} (${tenant.slug})`);

    const email = process.env['SEED_OWNER_EMAIL'] ?? DEFAULT_OWNER_EMAIL;
    const password = process.env['SEED_OWNER_PASSWORD'] ?? DEFAULT_OWNER_PASSWORD;
    const passwordHash = await argon2.hash(password);

    const owner = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      // Reset the password on re-seed so a developer is never locked out of a
      // database they have been reusing for weeks.
      update: { passwordHash, isActive: true, role: UserRole.OWNER },
      create: {
        tenantId: tenant.id,
        email,
        passwordHash,
        fullName: 'Demo Owner',
        role: UserRole.OWNER,
      },
    });
    log(`owner user: ${owner.email}`);

    const client = await prisma.client.upsert({
      where: { id: DEMO_CLIENT_ID },
      update: {},
      create: {
        id: DEMO_CLIENT_ID,
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
    log(`client: ${client.legalName}`);

    const project = await prisma.project.upsert({
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
    log(`project: ${project.code}`);
  },
};

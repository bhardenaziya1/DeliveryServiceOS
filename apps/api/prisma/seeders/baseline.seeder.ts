import { ClientStatus, ProjectStatus, UserStatus } from '@prisma/client';
import { ROLES, type RoleKey } from '@vendoros/shared';
import * as argon2 from 'argon2';
import { type Seeder } from './types';

const DEFAULT_OWNER_EMAIL = 'owner@demo-vendor.ae';
// Must satisfy the shared password policy (12+ chars, mixed case, a digit),
// otherwise the seeded account could not be created through the API.
const DEFAULT_OWNER_PASSWORD = 'DemoPassword123!';
// Stable, cuid-shaped so it passes the same validation as a generated id
// (see createProjectSchema.clientId).
const DEMO_CLIENT_ID = 'cdemoseedclient000000001';

/** One user per role, so every permission path is reachable in development. */
const DEMO_STAFF: { email: string; fullName: string; role: RoleKey }[] = [
  { email: 'admin@demo-vendor.ae', fullName: 'Layla Haddad', role: ROLES.ADMIN },
  { email: 'ops@demo-vendor.ae', fullName: 'Omar Farouk', role: ROLES.OPS_MANAGER },
  { email: 'hr@demo-vendor.ae', fullName: 'Fatima Noor', role: ROLES.HR_COMPLIANCE },
  { email: 'fleet@demo-vendor.ae', fullName: 'Rashid Khan', role: ROLES.FLEET_MANAGER },
  { email: 'finance@demo-vendor.ae', fullName: 'Priya Menon', role: ROLES.FINANCE_MANAGER },
  { email: 'accounts@demo-vendor.ae', fullName: 'Samir Iqbal', role: ROLES.ACCOUNTANT },
  { email: 'supervisor@demo-vendor.ae', fullName: 'Hassan Ali', role: ROLES.SUPERVISOR },
  { email: 'viewer@demo-vendor.ae', fullName: 'Nadia Rahman', role: ROLES.VIEWER },
];

/**
 * The minimum data needed to log in and see a populated shell: one tenant, a
 * user for each role, one client and one project.
 *
 * Deliberately tiny. Volume data for performance work belongs in a separate,
 * explicitly-invoked generator - not here, where it would run on every
 * developer's machine and in CI.
 *
 * Depends on `rbacSeeder` having created the roles it assigns.
 */
export const baselineSeeder: Seeder = {
  name: 'baseline',
  description: 'Demo tenant, one user per role, and one client/project to log in against',
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

    const roleIdByKey = new Map(
      (await prisma.role.findMany({ select: { id: true, key: true } })).map((role) => [
        role.key,
        role.id,
      ]),
    );

    if (roleIdByKey.size === 0) {
      throw new Error('No roles found. The rbac seeder must run before the baseline seeder.');
    }

    const email = process.env['SEED_OWNER_EMAIL'] ?? DEFAULT_OWNER_EMAIL;
    const password = process.env['SEED_OWNER_PASSWORD'] ?? DEFAULT_OWNER_PASSWORD;

    const upsertUser = async (
      userEmail: string,
      fullName: string,
      roleKey: RoleKey,
    ): Promise<void> => {
      const roleId = roleIdByKey.get(roleKey);
      if (!roleId) throw new Error(`Role ${roleKey} is not seeded`);

      const passwordHash = await argon2.hash(password);

      const user = await prisma.user.upsert({
        where: { email: userEmail },
        // Reset the password on re-seed so a developer is never locked out of
        // a database they have been reusing for weeks.
        update: {
          passwordHash,
          status: UserStatus.ACTIVE,
          failedLoginCount: 0,
          lockedUntil: null,
        },
        create: {
          tenantId: tenant.id,
          email: userEmail,
          passwordHash,
          fullName,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          passwordChangedAt: new Date(),
        },
      });

      // The role set is the desired state, so re-seeding repairs a role that
      // was changed by hand while poking at the running app.
      await prisma.userRoleAssignment.deleteMany({
        where: { userId: user.id, tenantId: tenant.id, roleId: { not: roleId } },
      });
      await prisma.userRoleAssignment.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { tenantId: tenant.id, userId: user.id, roleId },
      });

      log(`user: ${userEmail} (${roleKey})`);
    };

    await upsertUser(email, 'Demo Owner', ROLES.SUPER_ADMIN);
    for (const staff of DEMO_STAFF) {
      await upsertUser(staff.email, staff.fullName, staff.role);
    }

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

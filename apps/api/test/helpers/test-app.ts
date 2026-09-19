import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLES,
  SYSTEM_ROLES,
  type RoleKey,
} from '@vendoros/shared';
import * as argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { MAILER, type EmailMessage, type MailerService } from '../../src/common/mail/mailer.types';

export const API_PREFIX = '/api/v1';
export const TEST_PASSWORD = 'TestPassword123!';

/**
 * Captures outbound mail instead of sending it.
 *
 * This is the whole point of the `MAILER` port: the reset and invitation
 * suites read the link out of the message the user would have received, and
 * redeem it through the real public endpoint - no reaching into the database
 * to forge a token, and no mail provider in the loop.
 */
export class RecordingMailer implements MailerService {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** The `token` query parameter of the most recent message to an address. */
  lastTokenFor(email: string): string {
    const message = [...this.sent].reverse().find((entry) => entry.to === email);
    if (!message?.actionUrl) {
      throw new Error(`No actionable email was sent to ${email}`);
    }

    const token = new URL(message.actionUrl).searchParams.get('token');
    if (!token) {
      throw new Error(`The email to ${email} carried no token: ${message.actionUrl}`);
    }

    return token;
  }

  reset(): void {
    this.sent.length = 0;
  }
}

/**
 * Boots the real application - the same guard chain, interceptor and exception
 * filter production runs - against a live database.
 *
 * Nothing here stubs authorisation: the e2e suites exercise the actual
 * JWT/tenant/permission pipeline, which is the only way a tenant-isolation
 * assertion means anything. Only the mail transport is swapped.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  mailer: RecordingMailer;
}> {
  const mailer = new RecordingMailer();

  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  await app.init();

  return { app, mailer };
}

/**
 * Ensures the RBAC catalogue exists.
 *
 * The e2e suites assign real roles, so the tables the seed populates have to
 * be there. Idempotent, so running the suites repeatedly against one database
 * is safe.
 */
export async function ensureRbacSeeded(prisma: PrismaClient): Promise<void> {
  const groupOf = new Map<string, string>();
  for (const [groupKey, group] of Object.entries(PERMISSION_GROUPS)) {
    for (const permission of group.permissions) groupOf.set(permission, groupKey);
  }

  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key, group: groupOf.get(key) ?? 'other' },
    });
  }

  const permissionIdByKey = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map((permission) => [
      permission.key,
      permission.id,
    ]),
  );

  for (const definition of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { key: definition.key },
      update: { rank: definition.rank },
      create: {
        key: definition.key,
        name: definition.name,
        description: definition.description,
        rank: definition.rank,
      },
    });

    await prisma.rolePermission.createMany({
      data: definition.permissions
        .map((permission) => permissionIdByKey.get(permission))
        .filter((id): id is string => id !== undefined)
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}

export interface SeededTenant {
  id: string;
  slug: string;
}

export async function createTenant(prisma: PrismaClient, label: string): Promise<SeededTenant> {
  const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: label, slug } });
  return { id: tenant.id, slug };
}

/** Creates an active user with the given roles, ready to log in. */
export async function createUser(
  prisma: PrismaClient,
  params: { tenantId: string; email: string; fullName?: string; roles: RoleKey[] },
): Promise<{ id: string; email: string }> {
  const passwordHash = await argon2.hash(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      tenantId: params.tenantId,
      email: params.email,
      passwordHash,
      fullName: params.fullName ?? params.email,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const roles = await prisma.role.findMany({ where: { key: { in: params.roles } } });
  await prisma.userRoleAssignment.createMany({
    data: roles.map((role) => ({ tenantId: params.tenantId, userId: user.id, roleId: role.id })),
    skipDuplicates: true,
  });

  return { id: user.id, email: user.email };
}

export interface LoggedIn {
  accessToken: string;
  refreshToken: string;
  userId: string;
  sessionId: string;
}

export async function login(
  app: INestApplication,
  email: string,
  password = TEST_PASSWORD,
  rememberMe = false,
): Promise<LoggedIn> {
  const response = await request(app.getHttpServer())
    .post(`${API_PREFIX}/auth/login`)
    .send({ email, password, rememberMe })
    .expect(200);

  const { accessToken, refreshToken, user, sessionId } = response.body.data;
  return { accessToken, refreshToken, userId: user.id, sessionId };
}

/** Removes everything a suite created, respecting foreign keys. */
export async function cleanupTenants(prisma: PrismaClient, tenantIds: string[]): Promise<void> {
  if (tenantIds.length === 0) return;
  const where = { tenantId: { in: tenantIds } };

  await prisma.refreshToken.deleteMany({ where });
  await prisma.session.deleteMany({ where });
  await prisma.passwordResetToken.deleteMany({ where });
  await prisma.emailVerificationToken.deleteMany({ where });
  await prisma.invitationRole.deleteMany({
    where: { invitation: { tenantId: { in: tenantIds } } },
  });
  await prisma.invitation.deleteMany({ where });
  await prisma.userRoleAssignment.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.project.deleteMany({ where });
  await prisma.client.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

export { ROLES };

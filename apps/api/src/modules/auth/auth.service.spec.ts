import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
  };
  let auditService: { record: jest.Mock };
  let jwtService: { signAsync: jest.Mock };

  const user = {
    id: 'user-1',
    tenantId: 'tenant-a',
    email: 'owner@demo-vendor.ae',
    passwordHash: 'hashed',
    fullName: 'Demo Owner',
    role: UserRole.OWNER,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('rejects an unknown email without leaking whether the account exists', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@demo-vendor.ae', password: 'Password123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect password and records a LOGIN_FAILED audit entry', async () => {
    prisma.user.findFirst.mockResolvedValue(user);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED', tenantId: user.tenantId }),
    );
  });

  it('rejects a deactivated user even with the correct password', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...user, isActive: false });
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await expect(
      service.login({ email: user.email, password: 'Password123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issues a session token and records a LOGIN audit entry on success', async () => {
    prisma.user.findFirst.mockResolvedValue(user);
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    const session = await service.login({ email: user.email, password: 'Password123!' });

    expect(session.accessToken).toBe('signed-token');
    expect(session.user).toEqual({
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: user.id, tenantId: user.tenantId });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN', tenantId: user.tenantId }),
    );
  });
});

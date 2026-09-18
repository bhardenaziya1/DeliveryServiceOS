import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditAction, ClientStatus, UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { ClientService } from './client.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const actor: RequestUser = {
  id: 'user-1',
  tenantId: TENANT_A,
  email: 'owner@demo-vendor.ae',
  fullName: 'Demo Owner',
  role: UserRole.OWNER,
};

function buildClientRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'client-1',
    tenantId: TENANT_A,
    legalName: 'Swift Logistics FZ-LLC',
    tradeName: null,
    tradeLicenseNumber: null,
    taxRegistrationNumber: null,
    status: ClientStatus.ONBOARDING,
    primaryContactName: 'Ahmed Al Mazrouei',
    primaryContactEmail: 'ops@swiftlogistics.ae',
    primaryContactPhone: '+971501234567',
    billingAddress: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    _count: { projects: 0 },
    ...overrides,
  };
}

describe('ClientService', () => {
  let service: ClientService;
  let prisma: {
    client: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = moduleRef.get(ClientService);
  });

  describe('list', () => {
    it('scopes results to the caller tenant and paginates', async () => {
      const record = buildClientRecord();
      prisma.client.findMany.mockResolvedValue([record]);
      prisma.client.count.mockResolvedValue(1);

      const result = await service.list(TENANT_A, {
        page: 1,
        pageSize: 20,
        sortDir: 'desc',
      });

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A }),
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('client-1');
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the client belongs to a different tenant', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_B, 'client-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.client.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'client-1', tenantId: TENANT_B } }),
      );
    });
  });

  describe('create', () => {
    it('creates a client scoped to the actor tenant and records an audit entry', async () => {
      const record = buildClientRecord();
      prisma.client.create.mockResolvedValue(record);

      const dto = await service.create(actor, {
        legalName: 'Swift Logistics FZ-LLC',
        status: ClientStatus.ONBOARDING,
        primaryContactName: 'Ahmed Al Mazrouei',
        primaryContactEmail: 'ops@swiftlogistics.ae',
        primaryContactPhone: '+971501234567',
      });

      expect(prisma.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.CREATE, tenantId: TENANT_A }),
      );
      expect(dto.id).toBe('client-1');
    });
  });

  describe('remove', () => {
    it('rejects deletion when the client has projects', async () => {
      prisma.client.findFirst.mockResolvedValue(buildClientRecord({ _count: { projects: 2 } }));

      await expect(service.remove(actor, 'client-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.client.delete).not.toHaveBeenCalled();
    });

    it('deletes and audits when there are no dependent projects', async () => {
      prisma.client.findFirst.mockResolvedValue(buildClientRecord());
      prisma.client.delete.mockResolvedValue(undefined);

      await service.remove(actor, 'client-1');

      expect(prisma.client.delete).toHaveBeenCalledWith({ where: { id: 'client-1' } });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.DELETE }),
      );
    });
  });
});

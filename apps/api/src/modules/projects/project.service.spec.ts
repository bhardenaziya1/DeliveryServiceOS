import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectStatus, UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';

const TENANT_A = 'tenant-a';

const actor: RequestUser = {
  id: 'user-1',
  tenantId: TENANT_A,
  email: 'owner@demo-vendor.ae',
  fullName: 'Demo Owner',
  role: UserRole.OWNER,
};

function buildProjectRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'project-1',
    tenantId: TENANT_A,
    clientId: 'client-1',
    name: 'Dubai Last-Mile Delivery',
    code: 'SWIFT-DXB-01',
    status: ProjectStatus.DRAFT,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    client: { legalName: 'Swift Logistics FZ-LLC' },
    ...overrides,
  };
}

describe('ProjectService', () => {
  let service: ProjectService;
  let prisma: {
    project: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    client: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      client: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = moduleRef.get(ProjectService);
  });

  describe('create', () => {
    it('throws NotFoundException when the client does not belong to the tenant', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.create(actor, {
          clientId: 'client-1',
          name: 'Dubai Last-Mile Delivery',
          code: 'SWIFT-DXB-01',
          status: ProjectStatus.DRAFT,
          startDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate project code within the same tenant', async () => {
      prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
      prisma.project.findFirst.mockResolvedValue(buildProjectRecord());

      await expect(
        service.create(actor, {
          clientId: 'client-1',
          name: 'Dubai Last-Mile Delivery',
          code: 'SWIFT-DXB-01',
          status: ProjectStatus.DRAFT,
          startDate: '2026-01-01',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('creates a project scoped to the tenant and records an audit entry', async () => {
      prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
      prisma.project.findFirst.mockResolvedValue(null);
      prisma.project.create.mockResolvedValue(buildProjectRecord());

      const dto = await service.create(actor, {
        clientId: 'client-1',
        name: 'Dubai Last-Mile Delivery',
        code: 'SWIFT-DXB-01',
        status: ProjectStatus.DRAFT,
        startDate: '2026-01-01',
      });

      expect(dto.clientName).toBe('Swift Logistics FZ-LLC');
      expect(auditService.record).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('filters by clientId when provided', async () => {
      prisma.project.findMany.mockResolvedValue([buildProjectRecord()]);
      prisma.project.count.mockResolvedValue(1);

      await service.list(TENANT_A, { page: 1, pageSize: 20, sortDir: 'desc' }, 'client-1');

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, clientId: 'client-1' }),
        }),
      );
    });
  });
});

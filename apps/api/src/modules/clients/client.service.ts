import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import {
  ClientDto,
  CreateClientInput,
  PaginatedResult,
  PaginationQuery,
  UpdateClientInput,
} from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';
import { buildPaginatedResult } from '../../common/pagination/paginate';
import { toClientDto } from './client.mapper';

@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(tenantId: string, query: PaginationQuery): Promise<PaginatedResult<ClientDto>> {
    const where: Prisma.ClientWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              { legalName: { contains: query.search, mode: 'insensitive' } },
              { tradeName: { contains: query.search, mode: 'insensitive' } },
              { primaryContactEmail: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortableFields = new Set(['legalName', 'status', 'createdAt', 'updatedAt']);
    const orderBy: Prisma.ClientOrderByWithRelationInput =
      query.sortBy && sortableFields.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { projects: true } } },
      }),
      this.prisma.client.count({ where }),
    ]);

    return buildPaginatedResult(items.map(toClientDto), total, query);
  }

  async findOne(tenantId: string, id: string): Promise<ClientDto> {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { projects: true } } },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return toClientDto(client);
  }

  async create(actor: RequestUser, input: CreateClientInput): Promise<ClientDto> {
    const client = await this.prisma.client.create({
      data: {
        tenantId: actor.tenantId,
        legalName: input.legalName,
        tradeName: emptyToNull(input.tradeName),
        tradeLicenseNumber: emptyToNull(input.tradeLicenseNumber),
        taxRegistrationNumber: emptyToNull(input.taxRegistrationNumber),
        status: input.status,
        primaryContactName: input.primaryContactName,
        primaryContactEmail: input.primaryContactEmail,
        primaryContactPhone: input.primaryContactPhone,
        billingAddress: emptyToNull(input.billingAddress),
        notes: emptyToNull(input.notes),
      },
      include: { _count: { select: { projects: true } } },
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      entityType: 'Client',
      entityId: client.id,
      action: AuditAction.CREATE,
      after: client,
    });

    return toClientDto(client);
  }

  async update(actor: RequestUser, id: string, input: UpdateClientInput): Promise<ClientDto> {
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Client not found');
    }

    const client = await this.prisma.client.update({
      where: { id: existing.id, tenantId: actor.tenantId },
      data: {
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.tradeName !== undefined ? { tradeName: emptyToNull(input.tradeName) } : {}),
        ...(input.tradeLicenseNumber !== undefined
          ? { tradeLicenseNumber: emptyToNull(input.tradeLicenseNumber) }
          : {}),
        ...(input.taxRegistrationNumber !== undefined
          ? { taxRegistrationNumber: emptyToNull(input.taxRegistrationNumber) }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.primaryContactName !== undefined
          ? { primaryContactName: input.primaryContactName }
          : {}),
        ...(input.primaryContactEmail !== undefined
          ? { primaryContactEmail: input.primaryContactEmail }
          : {}),
        ...(input.primaryContactPhone !== undefined
          ? { primaryContactPhone: input.primaryContactPhone }
          : {}),
        ...(input.billingAddress !== undefined
          ? { billingAddress: emptyToNull(input.billingAddress) }
          : {}),
        ...(input.notes !== undefined ? { notes: emptyToNull(input.notes) } : {}),
      },
      include: { _count: { select: { projects: true } } },
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      entityType: 'Client',
      entityId: client.id,
      action: AuditAction.UPDATE,
      before: existing,
      after: client,
    });

    return toClientDto(client);
  }

  async remove(actor: RequestUser, id: string): Promise<void> {
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { _count: { select: { projects: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Client not found');
    }

    if (existing._count.projects > 0) {
      throw new ConflictException(
        'Cannot delete a client with existing projects. Offboard the client instead.',
      );
    }

    await this.prisma.client.delete({
      where: { id: existing.id, tenantId: actor.tenantId },
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      entityType: 'Client',
      entityId: existing.id,
      action: AuditAction.DELETE,
      before: existing,
    });
  }
}

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

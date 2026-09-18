import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import {
  CreateProjectInput,
  PaginatedResult,
  PaginationQuery,
  ProjectDto,
  UpdateProjectInput,
} from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/types/request-user';
import { buildPaginatedResult } from '../../common/pagination/paginate';
import { toProjectDto } from './project.mapper';

const projectInclude = { client: { select: { legalName: true } } } satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: PaginationQuery,
    clientId?: string,
  ): Promise<PaginatedResult<ProjectDto>> {
    const where: Prisma.ProjectWhereInput = {
      tenantId,
      ...(clientId ? { clientId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortableFields = new Set([
      'name',
      'code',
      'status',
      'startDate',
      'createdAt',
      'updatedAt',
    ]);
    const orderBy: Prisma.ProjectOrderByWithRelationInput =
      query.sortBy && sortableFields.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: projectInclude,
      }),
      this.prisma.project.count({ where }),
    ]);

    return buildPaginatedResult(items.map(toProjectDto), total, query);
  }

  async findOne(tenantId: string, id: string): Promise<ProjectDto> {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId },
      include: projectInclude,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return toProjectDto(project);
  }

  async create(actor: RequestUser, input: CreateProjectInput): Promise<ProjectDto> {
    const client = await this.prisma.client.findFirst({
      where: { id: input.clientId, tenantId: actor.tenantId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const existingCode = await this.prisma.project.findFirst({
      where: { tenantId: actor.tenantId, code: input.code },
    });

    if (existingCode) {
      throw new ConflictException(`Project code "${input.code}" is already in use`);
    }

    const project = await this.prisma.project.create({
      data: {
        tenantId: actor.tenantId,
        clientId: input.clientId,
        name: input.name,
        code: input.code,
        status: input.status,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        description: emptyToNull(input.description),
      },
      include: projectInclude,
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      entityType: 'Project',
      entityId: project.id,
      action: AuditAction.CREATE,
      after: project,
    });

    return toProjectDto(project);
  }

  async update(actor: RequestUser, id: string, input: UpdateProjectInput): Promise<ProjectDto> {
    const existing = await this.prisma.project.findFirst({
      where: { id, tenantId: actor.tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    if (input.code && input.code !== existing.code) {
      const codeTaken = await this.prisma.project.findFirst({
        where: { tenantId: actor.tenantId, code: input.code, NOT: { id: existing.id } },
      });
      if (codeTaken) {
        throw new ConflictException(`Project code "${input.code}" is already in use`);
      }
    }

    const project = await this.prisma.project.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? new Date(input.endDate) : null }
          : {}),
        ...(input.description !== undefined ? { description: emptyToNull(input.description) } : {}),
      },
      include: projectInclude,
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      entityType: 'Project',
      entityId: project.id,
      action: AuditAction.UPDATE,
      before: existing,
      after: project,
    });

    return toProjectDto(project);
  }

  async remove(actor: RequestUser, id: string): Promise<void> {
    const existing = await this.prisma.project.findFirst({
      where: { id, tenantId: actor.tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    await this.prisma.project.delete({ where: { id: existing.id } });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.id,
      entityType: 'Project',
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

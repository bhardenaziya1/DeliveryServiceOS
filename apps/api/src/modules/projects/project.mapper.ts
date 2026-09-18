import { Project } from '@prisma/client';
import { ProjectDto } from '@vendoros/shared';

type ProjectWithClient = Project & { client: { legalName: string } };

export function toProjectDto(project: ProjectWithClient): ProjectDto {
  return {
    id: project.id,
    tenantId: project.tenantId,
    clientId: project.clientId,
    clientName: project.client.legalName,
    name: project.name,
    code: project.code,
    status: project.status,
    startDate: project.startDate.toISOString(),
    endDate: project.endDate ? project.endDate.toISOString() : null,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

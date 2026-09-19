import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateProjectInput,
  createProjectSchema,
  PaginatedResult,
  PaginationQuery,
  paginationQuerySchema,
  ProjectDto,
  UpdateProjectInput,
  updateProjectSchema,
  PERMISSIONS,
} from '@vendoros/shared';
import { ProjectService } from './project.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/tenancy/tenant.decorator';
import { RequestUser } from '../../common/types/request-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('projects')
@ApiStandardErrorResponses()
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  @Get()
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
    @Query('clientId') clientId?: string,
  ): Promise<PaginatedResult<ProjectDto>> {
    return this.projectService.list(tenantId, query, clientId);
  }

  @RequirePermissions(PERMISSIONS.PROJECTS_READ)
  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string): Promise<ProjectDto> {
    return this.projectService.findOne(tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.PROJECTS_CREATE)
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ): Promise<ProjectDto> {
    return this.projectService.create(user, body);
  }

  @RequirePermissions(PERMISSIONS.PROJECTS_UPDATE)
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ): Promise<ProjectDto> {
    return this.projectService.update(user, id, body);
  }

  @RequirePermissions(PERMISSIONS.PROJECTS_DELETE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    return this.projectService.remove(user, id);
  }
}

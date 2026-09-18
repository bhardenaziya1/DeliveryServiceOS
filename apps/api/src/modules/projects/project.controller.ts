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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  CreateProjectInput,
  createProjectSchema,
  PaginatedResult,
  PaginationQuery,
  paginationQuerySchema,
  ProjectDto,
  UpdateProjectInput,
  updateProjectSchema,
} from '@vendoros/shared';
import { ProjectService } from './project.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('projects')
@ApiStandardErrorResponses()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
    @Query('clientId') clientId?: string,
  ): Promise<PaginatedResult<ProjectDto>> {
    return this.projectService.list(user.tenantId, query, clientId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<ProjectDto> {
    return this.projectService.findOne(user.tenantId, id);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.OPS_MANAGER)
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ): Promise<ProjectDto> {
    return this.projectService.create(user, body);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.OPS_MANAGER)
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ): Promise<ProjectDto> {
    return this.projectService.update(user, id, body);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    return this.projectService.remove(user, id);
  }
}

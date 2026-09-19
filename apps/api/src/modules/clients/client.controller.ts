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
  ClientDto,
  CreateClientInput,
  createClientSchema,
  PaginatedResult,
  PaginationQuery,
  paginationQuerySchema,
  UpdateClientInput,
  updateClientSchema,
  PERMISSIONS,
} from '@vendoros/shared';
import { ClientService } from './client.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/tenancy/tenant.decorator';
import { RequestUser } from '../../common/types/request-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('clients')
@ApiStandardErrorResponses()
@ApiBearerAuth()
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @RequirePermissions(PERMISSIONS.CLIENTS_READ)
  @Get()
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResult<ClientDto>> {
    return this.clientService.list(tenantId, query);
  }

  @RequirePermissions(PERMISSIONS.CLIENTS_READ)
  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string): Promise<ClientDto> {
    return this.clientService.findOne(tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.CLIENTS_CREATE)
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
  ): Promise<ClientDto> {
    return this.clientService.create(user, body);
  }

  @RequirePermissions(PERMISSIONS.CLIENTS_UPDATE)
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ): Promise<ClientDto> {
    return this.clientService.update(user, id, body);
  }

  @RequirePermissions(PERMISSIONS.CLIENTS_DELETE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    return this.clientService.remove(user, id);
  }
}

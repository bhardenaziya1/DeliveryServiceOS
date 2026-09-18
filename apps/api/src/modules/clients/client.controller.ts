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
  ClientDto,
  CreateClientInput,
  createClientSchema,
  PaginatedResult,
  PaginationQuery,
  paginationQuerySchema,
  UpdateClientInput,
  updateClientSchema,
} from '@vendoros/shared';
import { ClientService } from './client.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResult<ClientDto>> {
    return this.clientService.list(user.tenantId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<ClientDto> {
    return this.clientService.findOne(user.tenantId, id);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.OPS_MANAGER)
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
  ): Promise<ClientDto> {
    return this.clientService.create(user, body);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.OPS_MANAGER)
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ): Promise<ClientDto> {
    return this.clientService.update(user, id, body);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    return this.clientService.remove(user, id);
  }
}

import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  updateTenantSchema,
  type TenantDto,
  type UpdateTenantInput,
} from '@vendoros/shared';
import { TenantService } from './tenant.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { TenantId } from '../../common/tenancy/tenant.decorator';
import { RequestUser } from '../../common/types/request-user';
import type { AuditRequestContext } from '../../common/audit/audit.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('tenant')
@ApiStandardErrorResponses()
@ApiBearerAuth()
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @RequirePermissions(PERMISSIONS.TENANT_READ)
  @Get()
  @ApiOperation({
    summary: 'Your own tenant',
    description: 'The tenant is taken from the access token; there is no id parameter to supply.',
  })
  findCurrent(@TenantId() tenantId: string): Promise<TenantDto> {
    return this.tenantService.findCurrent(tenantId);
  }

  @RequirePermissions(PERMISSIONS.TENANT_UPDATE)
  @Patch()
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateTenantSchema)) body: UpdateTenantInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<TenantDto> {
    return this.tenantService.updateCurrent(user, body, context);
  }
}

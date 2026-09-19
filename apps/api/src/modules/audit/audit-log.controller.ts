import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditLogQuerySchema,
  PERMISSIONS,
  type AuditLogDto,
  type AuditLogQuery,
  type PaginatedResult,
} from '@vendoros/shared';
import { AuditLogService } from './audit-log.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { TenantId } from '../../common/tenancy/tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('audit')
@ApiStandardErrorResponses()
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @Get()
  @ApiOperation({ summary: 'The audit trail for your own tenant' })
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<PaginatedResult<AuditLogDto>> {
    return this.auditLogService.list(tenantId, query);
  }
}

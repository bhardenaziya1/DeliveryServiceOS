import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type PermissionDto, type RoleDto } from '@vendoros/shared';
import { RoleService } from './role.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('roles')
@ApiStandardErrorResponses()
@ApiBearerAuth()
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @Get()
  @ApiOperation({ summary: 'Every role and the permissions it grants' })
  list(): Promise<RoleDto[]> {
    return this.roleService.listRoles();
  }

  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @Get('permissions')
  listPermissions(): Promise<PermissionDto[]> {
    return this.roleService.listPermissions();
  }

  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @Get('permission-groups')
  listPermissionGroups() {
    return this.roleService.listPermissionGroups();
  }
}

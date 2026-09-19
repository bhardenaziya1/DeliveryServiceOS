import { Injectable } from '@nestjs/common';
import {
  isPermission,
  isRoleKey,
  PERMISSION_GROUPS,
  type PermissionDto,
  type RoleDto,
} from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Reads the RBAC catalogue.
 *
 * Roles and permissions are global rather than tenant-owned, so these queries
 * are intentionally outside the tenant-scope rule - there is nothing tenant
 * specific to leak. What a *user* holds is tenant-scoped and lives in
 * `UserService`.
 */
@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { rank: 'asc' },
    });

    return roles
      .filter((role) => isRoleKey(role.key))
      .map((role) => ({
        id: role.id,
        key: role.key as RoleDto['key'],
        name: role.name,
        description: role.description,
        rank: role.rank,
        isSystem: role.isSystem,
        permissions: role.permissions
          .map((link) => link.permission.key)
          .filter(isPermission)
          .sort(),
      }));
  }

  async listPermissions(): Promise<PermissionDto[]> {
    const permissions = await this.prisma.permission.findMany({ orderBy: { key: 'asc' } });

    return permissions
      .filter((permission) => isPermission(permission.key))
      .map((permission) => ({
        key: permission.key as PermissionDto['key'],
        description: permission.description,
        group: permission.group,
      }));
  }

  /** The grouping the admin UI renders, straight from the shared catalogue. */
  listPermissionGroups() {
    return Object.entries(PERMISSION_GROUPS).map(([key, group]) => ({
      key,
      label: group.label,
      permissions: group.permissions,
    }));
  }
}

import { ALL_PERMISSIONS, PERMISSION_GROUPS, SYSTEM_ROLES } from '@vendoros/shared';
import { type Seeder } from './types';

/**
 * Syncs the roles and permissions tables with the catalogue in
 * `packages/shared/src/rbac`.
 *
 * This runs on every deploy, not just first install: the shared definitions
 * are the source of truth, so adding a permission or re-scoping a role is a
 * code change plus a seed run, never a hand-written UPDATE against production.
 *
 * Existing rows are updated in place - roles keep their ids, so the
 * `user_roles` rows that point at them survive a re-scope untouched.
 */
export const rbacSeeder: Seeder = {
  name: 'rbac',
  description: 'System roles, permissions and their mapping',
  async run({ prisma, log }) {
    const groupOf = new Map<string, string>();
    for (const [groupKey, group] of Object.entries(PERMISSION_GROUPS)) {
      for (const permission of group.permissions) {
        groupOf.set(permission, groupKey);
      }
    }

    for (const key of ALL_PERMISSIONS) {
      const description = describePermission(key);
      await prisma.permission.upsert({
        where: { key },
        update: { description, group: groupOf.get(key) ?? 'other' },
        create: { key, description, group: groupOf.get(key) ?? 'other' },
      });
    }
    log(`permissions: ${ALL_PERMISSIONS.length}`);

    const permissionIdByKey = new Map(
      (await prisma.permission.findMany({ select: { id: true, key: true } })).map((permission) => [
        permission.key,
        permission.id,
      ]),
    );

    for (const definition of SYSTEM_ROLES) {
      const role = await prisma.role.upsert({
        where: { key: definition.key },
        update: {
          name: definition.name,
          description: definition.description,
          rank: definition.rank,
          isSystem: true,
        },
        create: {
          key: definition.key,
          name: definition.name,
          description: definition.description,
          rank: definition.rank,
          isSystem: true,
        },
      });

      const desired = definition.permissions
        .map((permission) => permissionIdByKey.get(permission))
        .filter((id): id is string => id !== undefined);

      // Replace the mapping wholesale so a permission removed from a role in
      // the catalogue is actually revoked, not merely left un-added.
      await prisma.$transaction([
        prisma.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { notIn: desired } },
        }),
        prisma.rolePermission.createMany({
          data: desired.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        }),
      ]);

      log(`role: ${definition.name} (${definition.permissions.length} permissions)`);
    }
  },
};

/** Turns `clients:update` into "Update clients". */
function describePermission(key: string): string {
  const [resource = '', action = ''] = key.split(':');
  const readable = resource.replace(/[-_]/g, ' ');
  const verb = action.charAt(0).toUpperCase() + action.slice(1);
  return `${verb} ${readable}`.trim();
}

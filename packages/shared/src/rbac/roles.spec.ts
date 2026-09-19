import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS, PERMISSION_GROUPS, isPermission } from './permissions';
import {
  ALL_ROLE_KEYS,
  canManageRole,
  getSystemRole,
  highestRank,
  isRoleKey,
  permissionsForRoles,
  ROLES,
  SYSTEM_ROLES,
} from './roles';

describe('the permission catalogue', () => {
  it('has no duplicates', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('uses resource:action keys throughout', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+:[a-z]+$/);
    }
  });

  it('places every permission in exactly one group', () => {
    const grouped = Object.values(PERMISSION_GROUPS).flatMap((group) => group.permissions);

    expect(new Set(grouped).size).toBe(grouped.length);
    expect(new Set(grouped)).toEqual(new Set(ALL_PERMISSIONS));
  });
});

describe('the role catalogue', () => {
  it('ships the nine documented roles', () => {
    expect(ALL_ROLE_KEYS).toHaveLength(9);
    expect(SYSTEM_ROLES.map((role) => role.name)).toEqual([
      'Super Admin',
      'Admin',
      'Operations Manager',
      'HR / Compliance',
      'Fleet Manager',
      'Finance Manager',
      'Accountant',
      'Supervisor',
      'Viewer',
    ]);
  });

  it('grants only permissions that exist', () => {
    for (const role of SYSTEM_ROLES) {
      for (const permission of role.permissions) {
        expect(isPermission(permission)).toBe(true);
      }
    }
  });

  it('never grants the same permission twice within a role', () => {
    for (const role of SYSTEM_ROLES) {
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('gives Super Admin every permission', () => {
    expect(new Set(getSystemRole(ROLES.SUPER_ADMIN).permissions)).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('withholds only tenant settings from Admin', () => {
    const admin = new Set(getSystemRole(ROLES.ADMIN).permissions);

    expect(admin.has(PERMISSIONS.TENANT_UPDATE)).toBe(false);
    expect(ALL_PERMISSIONS.filter((permission) => !admin.has(permission))).toEqual([
      PERMISSIONS.TENANT_UPDATE,
    ]);
  });

  it('keeps Viewer read-only', () => {
    const viewer = getSystemRole(ROLES.VIEWER).permissions;

    expect(viewer.every((permission) => permission.endsWith(':read'))).toBe(true);
  });

  it('lets an Accountant raise invoices but not approve payroll', () => {
    const accountant = new Set(getSystemRole(ROLES.ACCOUNTANT).permissions);

    expect(accountant.has(PERMISSIONS.INVOICES_MANAGE)).toBe(true);
    expect(accountant.has(PERMISSIONS.PAYROLL_READ)).toBe(true);
    expect(accountant.has(PERMISSIONS.PAYROLL_MANAGE)).toBe(false);
    expect(accountant.has(PERMISSIONS.FINANCE_MANAGE)).toBe(false);
  });

  it('keeps a Supervisor out of anything commercial or financial', () => {
    const supervisor = new Set(getSystemRole(ROLES.SUPERVISOR).permissions);

    expect(supervisor.has(PERMISSIONS.CLIENTS_UPDATE)).toBe(false);
    expect(supervisor.has(PERMISSIONS.FINANCE_READ)).toBe(false);
    expect(supervisor.has(PERMISSIONS.WORKFORCE_READ)).toBe(true);
  });

  it('gives only Super Admin and Admin the power to assign roles', () => {
    const canAssign = SYSTEM_ROLES.filter((role) =>
      role.permissions.includes(PERMISSIONS.ROLES_ASSIGN),
    ).map((role) => role.key);

    expect(canAssign).toEqual([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  });

  it('ranks Super Admin above Admin above everyone else', () => {
    expect(getSystemRole(ROLES.SUPER_ADMIN).rank).toBeLessThan(getSystemRole(ROLES.ADMIN).rank);
    expect(getSystemRole(ROLES.ADMIN).rank).toBeLessThan(getSystemRole(ROLES.VIEWER).rank);
  });
});

describe('permissionsForRoles', () => {
  it('unions the permissions of several roles', () => {
    const combined = new Set(permissionsForRoles([ROLES.ACCOUNTANT, ROLES.FLEET_MANAGER]));

    expect(combined.has(PERMISSIONS.INVOICES_MANAGE)).toBe(true);
    expect(combined.has(PERMISSIONS.FLEET_MANAGE)).toBe(true);
  });

  it('de-duplicates overlapping grants', () => {
    const permissions = permissionsForRoles([ROLES.VIEWER, ROLES.SUPERVISOR]);

    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it('ignores an unknown role rather than throwing', () => {
    expect(permissionsForRoles(['NOT_A_ROLE'])).toEqual([]);
  });

  it('returns nothing for no roles', () => {
    expect(permissionsForRoles([])).toEqual([]);
  });
});

describe('canManageRole', () => {
  it('lets a Super Admin grant any role, including their own', () => {
    for (const role of ALL_ROLE_KEYS) {
      expect(canManageRole([ROLES.SUPER_ADMIN], role)).toBe(true);
    }
  });

  it('stops an Admin from minting a Super Admin', () => {
    // The escalation that matters: an Admin who could grant Super Admin could
    // give themselves unrestricted access through a second account.
    expect(canManageRole([ROLES.ADMIN], ROLES.SUPER_ADMIN)).toBe(false);
  });

  it('lets an Admin appoint another Admin and anything below', () => {
    expect(canManageRole([ROLES.ADMIN], ROLES.ADMIN)).toBe(true);
    expect(canManageRole([ROLES.ADMIN], ROLES.OPS_MANAGER)).toBe(true);
    expect(canManageRole([ROLES.ADMIN], ROLES.VIEWER)).toBe(true);
  });

  it('judges by the caller most privileged role', () => {
    expect(canManageRole([ROLES.VIEWER, ROLES.ADMIN], ROLES.SUPERVISOR)).toBe(true);
    expect(canManageRole([ROLES.VIEWER, ROLES.SUPERVISOR], ROLES.ADMIN)).toBe(false);
  });

  it('refuses an unknown target role', () => {
    expect(canManageRole([ROLES.SUPER_ADMIN], 'NOT_A_ROLE')).toBe(false);
  });

  it('refuses everything when the caller holds no recognised role', () => {
    for (const role of ALL_ROLE_KEYS) {
      expect(canManageRole([], role)).toBe(false);
      expect(canManageRole(['NOT_A_ROLE'], role)).toBe(false);
    }
  });
});

describe('highestRank', () => {
  it('returns the tightest rank held', () => {
    expect(highestRank([ROLES.VIEWER, ROLES.ADMIN])).toBe(getSystemRole(ROLES.ADMIN).rank);
  });

  it('is unbounded for someone with no roles, so they outrank nothing', () => {
    expect(highestRank([])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isRoleKey', () => {
  it('accepts the shipped roles and nothing else', () => {
    expect(isRoleKey(ROLES.FLEET_MANAGER)).toBe(true);
    expect(isRoleKey('OWNER')).toBe(false);
    expect(isRoleKey('')).toBe(false);
  });
});

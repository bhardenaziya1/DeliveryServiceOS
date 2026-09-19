import { PERMISSIONS, type Permission, ALL_PERMISSIONS } from './permissions';

/**
 * The nine system roles shipped with VendorOS.
 *
 * Roles are rows in the `roles` table, not a database enum, so a later sprint
 * can add tenant-defined roles without a migration. These nine are marked
 * `isSystem` and are seeded (and re-synced) from `SYSTEM_ROLES` below.
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  OPS_MANAGER: 'OPS_MANAGER',
  HR_COMPLIANCE: 'HR_COMPLIANCE',
  FLEET_MANAGER: 'FLEET_MANAGER',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  SUPERVISOR: 'SUPERVISOR',
  VIEWER: 'VIEWER',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export interface SystemRoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  /**
   * Lower binds tighter. A user may never assign or revoke a role whose rank is
   * at or above their own most-privileged role, which is what stops an Admin
   * from minting a Super Admin (or from demoting one).
   */
  rank: number;
  permissions: Permission[];
}

const P = PERMISSIONS;

/** Read-only access to the commercial records every back-office role needs. */
const COMMERCIAL_READ: Permission[] = [P.CLIENTS_READ, P.PROJECTS_READ];

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description:
      'Full control of the tenant, including tenant settings and granting the Super Admin role.',
    rank: 0,
    permissions: [...ALL_PERMISSIONS],
  },
  {
    key: ROLES.ADMIN,
    name: 'Admin',
    description:
      'Runs the tenant day to day: users, roles, clients, projects, operations and finance. Cannot change tenant-level settings.',
    rank: 10,
    // Everything except the tenant-level settings a Super Admin owns.
    permissions: ALL_PERMISSIONS.filter((permission) => permission !== P.TENANT_UPDATE),
  },
  {
    key: ROLES.OPS_MANAGER,
    name: 'Operations Manager',
    description: 'Owns client delivery: projects, deployments and the operational workforce.',
    rank: 20,
    permissions: [
      P.TENANT_READ,
      P.USERS_READ,
      P.ROLES_READ,
      P.CLIENTS_READ,
      P.CLIENTS_CREATE,
      P.CLIENTS_UPDATE,
      P.PROJECTS_READ,
      P.PROJECTS_CREATE,
      P.PROJECTS_UPDATE,
      P.WORKFORCE_READ,
      P.WORKFORCE_MANAGE,
      P.FLEET_READ,
      P.COMPLIANCE_READ,
      P.REPORTS_READ,
    ],
  },
  {
    key: ROLES.HR_COMPLIANCE,
    name: 'HR / Compliance',
    description:
      'Owns the workforce lifecycle and regulatory compliance: onboarding, documents, visas and expiries.',
    rank: 30,
    permissions: [
      P.TENANT_READ,
      P.USERS_READ,
      P.USERS_INVITE,
      P.ROLES_READ,
      P.AUDIT_READ,
      P.WORKFORCE_READ,
      P.WORKFORCE_MANAGE,
      P.COMPLIANCE_READ,
      P.COMPLIANCE_MANAGE,
      P.REPORTS_READ,
    ],
  },
  {
    key: ROLES.FLEET_MANAGER,
    name: 'Fleet Manager',
    description: 'Owns vehicles: assignment, maintenance, fines and vehicle compliance documents.',
    rank: 30,
    permissions: [
      P.TENANT_READ,
      P.USERS_READ,
      P.ROLES_READ,
      ...COMMERCIAL_READ,
      P.WORKFORCE_READ,
      P.FLEET_READ,
      P.FLEET_MANAGE,
      P.COMPLIANCE_READ,
      P.REPORTS_READ,
    ],
  },
  {
    key: ROLES.FINANCE_MANAGER,
    name: 'Finance Manager',
    description:
      'Owns the money: payroll runs, client invoicing, settlements and profitability reporting.',
    rank: 30,
    permissions: [
      P.TENANT_READ,
      P.USERS_READ,
      P.ROLES_READ,
      P.AUDIT_READ,
      ...COMMERCIAL_READ,
      P.FINANCE_READ,
      P.FINANCE_MANAGE,
      P.PAYROLL_READ,
      P.PAYROLL_MANAGE,
      P.INVOICES_READ,
      P.INVOICES_MANAGE,
      P.REPORTS_READ,
    ],
  },
  {
    key: ROLES.ACCOUNTANT,
    name: 'Accountant',
    description:
      'Prepares invoices and reconciles settlements. Reads payroll and finance but cannot approve or post them.',
    rank: 40,
    permissions: [
      P.TENANT_READ,
      ...COMMERCIAL_READ,
      P.FINANCE_READ,
      P.PAYROLL_READ,
      P.INVOICES_READ,
      P.INVOICES_MANAGE,
      P.REPORTS_READ,
    ],
  },
  {
    key: ROLES.SUPERVISOR,
    name: 'Supervisor',
    description:
      'Runs a site or shift: sees the workforce and fleet assigned to their projects, changes nothing commercial.',
    rank: 50,
    permissions: [
      P.TENANT_READ,
      ...COMMERCIAL_READ,
      P.WORKFORCE_READ,
      P.FLEET_READ,
      P.REPORTS_READ,
    ],
  },
  {
    key: ROLES.VIEWER,
    name: 'Viewer',
    description: 'Read-only access to clients, projects and reports.',
    rank: 60,
    permissions: [P.TENANT_READ, ...COMMERCIAL_READ, P.REPORTS_READ],
  },
];

export const ALL_ROLE_KEYS: RoleKey[] = SYSTEM_ROLES.map((role) => role.key);

const ROLE_BY_KEY = new Map<RoleKey, SystemRoleDefinition>(
  SYSTEM_ROLES.map((role) => [role.key, role]),
);

export function getSystemRole(key: RoleKey): SystemRoleDefinition {
  const role = ROLE_BY_KEY.get(key);
  if (!role) {
    throw new Error(`Unknown role key: ${key}`);
  }
  return role;
}

export function isRoleKey(value: string): value is RoleKey {
  return ROLE_BY_KEY.has(value as RoleKey);
}

/** The permissions a set of role keys grants, de-duplicated. */
export function permissionsForRoles(roleKeys: readonly string[]): Permission[] {
  const granted = new Set<Permission>();
  for (const key of roleKeys) {
    if (!isRoleKey(key)) continue;
    for (const permission of getSystemRole(key).permissions) {
      granted.add(permission);
    }
  }
  return [...granted];
}

/**
 * The rank of the caller's most privileged role. Used for the
 * "never escalate above yourself" rule in role assignment.
 */
export function highestRank(roleKeys: readonly string[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const key of roleKeys) {
    if (!isRoleKey(key)) continue;
    best = Math.min(best, getSystemRole(key).rank);
  }
  return best;
}

/**
 * Whether an actor holding `actorRoles` may grant or revoke `targetRole`.
 *
 * An actor may manage roles at or below their own privilege, never above it -
 * so an Admin can appoint another Admin but can neither mint a Super Admin nor
 * demote one. Combined with the `roles:assign` permission (which only Super
 * Admin and Admin hold), this is what stops privilege escalation through the
 * role-assignment endpoint.
 */
export function canManageRole(actorRoles: readonly string[], targetRole: string): boolean {
  if (!isRoleKey(targetRole)) return false;
  return getSystemRole(targetRole).rank >= highestRank(actorRoles);
}

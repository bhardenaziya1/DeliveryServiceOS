/**
 * The permission catalogue.
 *
 * A permission is a stable `resource:action` string. It is the *only* thing
 * authorisation decisions are made against - never a role name - so adding a
 * role never requires touching a guard, and re-scoping a role never requires
 * touching a controller.
 *
 * This list is the single source of truth for both sides of the wire: the API
 * seeds the `permissions` table from it and the React app hides actions the
 * current user does not hold. Adding an entry here and running the seed is the
 * whole workflow.
 */
export const PERMISSIONS = {
  // Tenant administration
  TENANT_READ: 'tenant:read',
  TENANT_UPDATE: 'tenant:update',

  // Identity
  USERS_READ: 'users:read',
  USERS_INVITE: 'users:invite',
  USERS_UPDATE: 'users:update',
  USERS_DEACTIVATE: 'users:deactivate',
  ROLES_READ: 'roles:read',
  ROLES_ASSIGN: 'roles:assign',
  SESSIONS_READ: 'sessions:read',
  SESSIONS_REVOKE: 'sessions:revoke',
  AUDIT_READ: 'audit:read',

  // Commercial
  CLIENTS_READ: 'clients:read',
  CLIENTS_CREATE: 'clients:create',
  CLIENTS_UPDATE: 'clients:update',
  CLIENTS_DELETE: 'clients:delete',
  PROJECTS_READ: 'projects:read',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_DELETE: 'projects:delete',

  // Operations
  WORKFORCE_READ: 'workforce:read',
  WORKFORCE_MANAGE: 'workforce:manage',
  FLEET_READ: 'fleet:read',
  FLEET_MANAGE: 'fleet:manage',
  COMPLIANCE_READ: 'compliance:read',
  COMPLIANCE_MANAGE: 'compliance:manage',

  // Money
  FINANCE_READ: 'finance:read',
  FINANCE_MANAGE: 'finance:manage',
  PAYROLL_READ: 'payroll:read',
  PAYROLL_MANAGE: 'payroll:manage',
  INVOICES_READ: 'invoices:read',
  INVOICES_MANAGE: 'invoices:manage',

  REPORTS_READ: 'reports:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Human-readable grouping, used by the roles/permissions admin screens. */
export const PERMISSION_GROUPS: Record<string, { label: string; permissions: Permission[] }> = {
  tenant: {
    label: 'Tenant',
    permissions: [PERMISSIONS.TENANT_READ, PERMISSIONS.TENANT_UPDATE],
  },
  identity: {
    label: 'Users & access',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_INVITE,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_DEACTIVATE,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.ROLES_ASSIGN,
      PERMISSIONS.SESSIONS_READ,
      PERMISSIONS.SESSIONS_REVOKE,
      PERMISSIONS.AUDIT_READ,
    ],
  },
  commercial: {
    label: 'Clients & projects',
    permissions: [
      PERMISSIONS.CLIENTS_READ,
      PERMISSIONS.CLIENTS_CREATE,
      PERMISSIONS.CLIENTS_UPDATE,
      PERMISSIONS.CLIENTS_DELETE,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.PROJECTS_CREATE,
      PERMISSIONS.PROJECTS_UPDATE,
      PERMISSIONS.PROJECTS_DELETE,
    ],
  },
  operations: {
    label: 'Operations',
    permissions: [
      PERMISSIONS.WORKFORCE_READ,
      PERMISSIONS.WORKFORCE_MANAGE,
      PERMISSIONS.FLEET_READ,
      PERMISSIONS.FLEET_MANAGE,
      PERMISSIONS.COMPLIANCE_READ,
      PERMISSIONS.COMPLIANCE_MANAGE,
    ],
  },
  finance: {
    label: 'Finance',
    permissions: [
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.PAYROLL_READ,
      PERMISSIONS.PAYROLL_MANAGE,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.INVOICES_MANAGE,
      PERMISSIONS.REPORTS_READ,
    ],
  },
};

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

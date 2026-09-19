// Plain const objects (not TS `enum`) so these values structurally match the
// enums Prisma generates on the API side - two nominal TS enums with the same
// string values are NOT mutually assignable, but a string-literal union is.
//
// Roles are deliberately absent: they are rows in the `roles` table, not a
// database enum, so they live in `../rbac/roles` alongside their permissions.

export const ClientStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ONBOARDING: 'ONBOARDING',
  OFFBOARDED: 'OFFBOARDED',
} as const;
export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus];

export const ProjectStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  CLOSED: 'CLOSED',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ALL_CLIENT_STATUSES = Object.values(ClientStatus);
export const ALL_PROJECT_STATUSES = Object.values(ProjectStatus);

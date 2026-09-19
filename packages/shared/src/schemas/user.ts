import { z } from 'zod';
import { ALL_ROLE_KEYS, type RoleKey } from '../rbac/roles';
import type { Permission } from '../rbac/permissions';

export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ALL_USER_STATUSES = Object.values(UserStatus);

export interface UserDto {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  status: UserStatus;
  emailVerified: boolean;
  roles: RoleKey[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.DISABLED]).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter a full name').max(120),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Replaces the user's role set wholesale - the request is the desired state. */
export const assignRolesSchema = z.object({
  roleKeys: z
    .array(z.enum(ALL_ROLE_KEYS as [RoleKey, ...RoleKey[]]))
    .min(1, 'A user must hold at least one role'),
});
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;

export interface RoleDto {
  id: string;
  key: RoleKey;
  name: string;
  description: string;
  rank: number;
  isSystem: boolean;
  permissions: Permission[];
}

export interface PermissionDto {
  key: Permission;
  description: string;
  group: string;
}

export interface InvitationDto {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  roles: RoleKey[];
  invitedByUserId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

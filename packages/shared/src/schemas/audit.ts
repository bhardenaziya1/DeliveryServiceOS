import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

/**
 * Every action worth reconstructing later.
 *
 * Authentication and access-control events are first-class here alongside the
 * CRUD actions, because "who logged in, from where, and who changed their
 * role" is exactly what a compliance audit asks for.
 */
export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',

  TENANT_CREATED: 'TENANT_CREATED',

  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',

  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  /** A already-rotated refresh token was replayed - the session is killed. */
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  SESSION_REVOKED: 'SESSION_REVOKED',

  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',

  EMAIL_VERIFICATION_SENT: 'EMAIL_VERIFICATION_SENT',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',

  USER_INVITED: 'USER_INVITED',
  USER_REGISTERED: 'USER_REGISTERED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DISABLED: 'USER_DISABLED',
  ROLES_CHANGED: 'ROLES_CHANGED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const ALL_AUDIT_ACTIONS = Object.values(AuditAction);

export interface AuditLogDto {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.enum(ALL_AUDIT_ACTIONS as [AuditAction, ...AuditAction[]]).optional(),
  entityType: z.string().trim().max(60).optional(),
  actorUserId: z.string().trim().max(60).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

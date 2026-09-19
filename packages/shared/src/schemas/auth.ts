import { z } from 'zod';
import { ALL_ROLE_KEYS, type RoleKey } from '../rbac/roles';
import type { Permission } from '../rbac/permissions';

/**
 * Password policy, shared by the API and the sign-up/reset forms so the rules a
 * user sees are exactly the rules the server enforces.
 *
 * Length does most of the work; the character-class rules exist because UAE
 * enterprise customers expect them in a security questionnaire.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  // argon2 has no practical input limit, but an unbounded field is a cheap
  // way to burn CPU, so the cap is enforced before hashing.
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /[0-9]/.test(value), 'Password must contain a number');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

const fullNameSchema = z.string().trim().min(2, 'Enter a full name').max(120);

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately NOT `passwordSchema`: an existing password that predates a
  // policy change must still be able to log in (and be prompted to rotate).
  password: z.string().min(1, 'Enter your password'),
  /**
   * Opts into a long-lived refresh token and session. Off by default, and the
   * server decides the actual lifetimes - the client only expresses intent.
   */
  rememberMe: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Public sign-up: creates a tenant and its first Super Admin in one step.
 * There is no way to join an existing tenant from here - that is an invitation.
 */
export const registerSchema = z.object({
  tenantName: z.string().trim().min(2, 'Enter your company name').max(160),
  /** Optional: derived from `tenantName` when omitted. */
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Slug must be at least 3 characters')
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
    .optional(),
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'A refresh token is required'),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const logoutSchema = z.object({
  /** Omitted for a "sign out everywhere" logout of the current session only. */
  refreshToken: z.string().min(1).optional(),
  /** Revokes every session for the user, not just the current one. */
  allSessions: z.boolean().optional().default(false),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'This reset link is invalid'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'This verification link is invalid'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'This invitation link is invalid'),
  fullName: fullNameSchema,
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const inviteUserSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema,
  roleKeys: z
    .array(z.enum(ALL_ROLE_KEYS as [RoleKey, ...RoleKey[]]))
    .min(1, 'Select at least one role'),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/**
 * The authenticated user as the client sees it.
 *
 * `roles` and `permissions` are resolved server-side from `user_roles` on every
 * request. The frontend uses them to hide what the user cannot do; the backend
 * never trusts them coming back.
 */
export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  roles: RoleKey[];
  permissions: Permission[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
}

/** `GET /auth/me` - everything the shell needs to render for this user. */
export interface CurrentUserResponse {
  user: AuthUser;
  tenant: AuthTenant;
  /** The session this access token belongs to. */
  sessionId: string;
}

export interface AuthTokens {
  accessToken: string;
  /** Opaque, single-use. Rotated on every refresh. */
  refreshToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthSession extends AuthTokens {
  user: AuthUser;
  tenant: AuthTenant;
  sessionId: string;
}

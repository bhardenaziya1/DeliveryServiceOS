export interface SessionDto {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  rememberMe: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** True for the session the requesting access token belongs to. */
  current: boolean;
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque single-use tokens: refresh, password reset, email verification and
 * invitations.
 *
 * All four follow the same rules:
 *
 * - 32 bytes from the CSPRNG, base64url encoded, so they are unguessable and
 *   safe to put in a URL;
 * - only the SHA-256 digest is persisted, so a database leak yields nothing
 *   that can be replayed;
 * - lookup is by digest, which is a plain indexed equality match.
 *
 * SHA-256 rather than argon2 here on purpose: these are high-entropy random
 * values, not user-chosen passwords, so there is nothing for a slow hash to
 * defend against and the lookup stays a single indexed read.
 */
const TOKEN_BYTES = 32;

export interface GeneratedToken {
  /** Handed to the user exactly once - in an email or a login response. */
  token: string;
  /** What gets written to the database. */
  tokenHash: string;
}

export function generateSecureToken(): GeneratedToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two token digests.
 *
 * Database lookups already compare by index, so this is for the rare in-memory
 * comparison where a timing signal would otherwise leak digest prefixes.
 */
export function tokenHashesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

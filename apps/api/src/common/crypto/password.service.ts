import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing, in one place.
 *
 * argon2id with explicit parameters rather than the library defaults, so the
 * cost is a reviewed decision recorded in the codebase instead of whatever a
 * future dependency bump happens to pick. The values follow the OWASP Password
 * Storage Cheat Sheet's argon2id recommendation (19 MiB, 2 iterations,
 * 1 degree of parallelism).
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * A pre-computed hash of a random value, verified against when the account does
 * not exist. It makes a login attempt for an unknown email take the same time
 * as one for a known email, so the response time cannot be used to enumerate
 * which addresses are registered.
 */
let decoyHash: string | undefined;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed or truncated stored hash must read as "wrong password",
      // never as an unhandled 500 that distinguishes this account from others.
      return false;
    }
  }

  /**
   * Burns the same work as a real verification, for the no-such-user path.
   */
  async verifyDecoy(password: string): Promise<false> {
    decoyHash ??= await argon2.hash('vendoros-decoy-password', ARGON2_OPTIONS);
    await this.verify(decoyHash, password);
    return false;
  }

  /**
   * Whether a stored hash was produced with weaker parameters than the current
   * policy, and should be re-hashed on the user's next successful login.
   */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, ARGON2_OPTIONS);
    } catch {
      return true;
    }
  }
}

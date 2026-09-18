import { type PrismaClient } from '@prisma/client';

export interface SeedContext {
  prisma: PrismaClient;
  /** Structured-ish progress output; seeders should not call console directly. */
  log: (message: string) => void;
}

/**
 * A unit of seed work.
 *
 * Every seeder must be idempotent: `npm run db:seed` is expected to be safe to
 * run repeatedly against the same database, so use `upsert` (or an existence
 * check) rather than `create`.
 */
export interface Seeder {
  name: string;
  description: string;
  run: (context: SeedContext) => Promise<void>;
}

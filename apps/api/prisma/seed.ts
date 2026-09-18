/**
 * Seed entry point - `npm run db:seed` (or `prisma db seed`).
 *
 * The runner owns connection handling, ordering, timing and exit codes;
 * individual seeders in ./seeders only describe the data they need.
 */
import { PrismaClient } from '@prisma/client';
import { seeders } from './seeders';

const prisma = new PrismaClient();

function log(message: string): void {
  console.log(`  ${message}`);
}

async function main(): Promise<void> {
  // Seeding a production database is almost always a mistake, and this script
  // resets the demo owner's password - so it has to be asked for explicitly.
  if (process.env['NODE_ENV'] === 'production' && process.env['SEED_ALLOW_PRODUCTION'] !== 'true') {
    throw new Error(
      'Refusing to seed with NODE_ENV=production. Set SEED_ALLOW_PRODUCTION=true if this is intentional.',
    );
  }

  console.log(`Seeding database (${seeders.length} seeder(s))`);

  for (const seeder of seeders) {
    const startedAt = Date.now();
    console.log(`- ${seeder.name}: ${seeder.description}`);
    await seeder.run({ prisma, log });
    console.log(`  done in ${Date.now() - startedAt}ms`);
  }

  console.log('Seeding complete');
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

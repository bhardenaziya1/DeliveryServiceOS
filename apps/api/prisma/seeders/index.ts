import { baselineSeeder } from './baseline.seeder';
import { type Seeder } from './types';

/**
 * Seeders run in array order; later entries may depend on earlier ones.
 * Register new seeders here.
 */
export const seeders: Seeder[] = [baselineSeeder];

export * from './types';

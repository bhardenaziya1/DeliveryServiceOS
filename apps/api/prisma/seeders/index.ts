import { rbacSeeder } from './rbac.seeder';
import { baselineSeeder } from './baseline.seeder';
import { type Seeder } from './types';

/**
 * Seeders run in array order; later entries may depend on earlier ones.
 * `rbac` must come first - `baseline` assigns the roles it creates.
 * Register new seeders here.
 */
export const seeders: Seeder[] = [rbacSeeder, baselineSeeder];

export * from './types';

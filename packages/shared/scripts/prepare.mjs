#!/usr/bin/env node
/**
 * `prepare` hook for @vendoros/shared.
 *
 * Building here is what lets a clean `npm install` leave apps/api and apps/web
 * with resolvable types. But npm runs `prepare` after *every* install,
 * including installs where building is impossible or pointless:
 *
 *  - Docker's dependency layer installs from the package manifests alone,
 *    before the source tree is copied in (see apps/api/Dockerfile).
 *  - A production install (`--omit=dev`, or any install with
 *    NODE_ENV=production) has no TypeScript. Falling through to a globally
 *    installed `tsc` of some other version produces a baffling error.
 *
 * Neither case should fail the install, so detect them and skip.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function skip(reason) {
  console.log(`@vendoros/shared: skipping prepare build (${reason})`);
  process.exit(0);
}

if (
  !existsSync(resolve(packageRoot, 'tsconfig.json')) ||
  !existsSync(resolve(packageRoot, 'src'))
) {
  skip('sources are not present yet');
}

try {
  require.resolve('typescript');
} catch {
  skip('typescript is not installed');
}

const result = spawnSync('npm', ['run', 'build'], {
  cwd: packageRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);

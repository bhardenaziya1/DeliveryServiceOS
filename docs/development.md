# Development guide

Everything you need to get VendorOS running locally, and what to reach for when it misbehaves.

## Prerequisites

| Tool                | Version     | Notes                                              |
| ------------------- | ----------- | -------------------------------------------------- |
| Node.js             | >= 20       | `engines` in the root `package.json` enforces this |
| npm                 | >= 10       | workspaces are used, so npm (not yarn/pnpm)        |
| Docker + Compose v2 | any current | only for PostgreSQL and Redis                      |

A local PostgreSQL 16 and Redis 7 work just as well as the containers - only `DATABASE_URL`
and `REDIS_URL` matter to the app.

## First run

```bash
git clone <repo> && cd DeliveryServiceOS

cp .env.example .env         # one env file for the whole monorepo
npm install                  # also builds packages/shared via its prepare script

npm run services:up          # PostgreSQL + Redis, waits until both are healthy
npm run db:generate          # Prisma client
npm run db:migrate           # apply migrations (creates the schema)
npm run db:seed              # tiny baseline dataset

npm run dev:api              # terminal 1 -> http://localhost:3000/api/v1
npm run dev:web              # terminal 2 -> http://localhost:5173
```

Then check:

- <http://localhost:3000/api/v1/health> - liveness
- <http://localhost:3000/api/v1/health/ready> - PostgreSQL + Redis
- <http://localhost:3000/api/v1/docs> - Swagger UI
- <http://localhost:5173> - the app

Seeded logins: one user per role, all with the password `DemoPassword123!` — `owner@` (Super
Admin), `admin@`, `ops@`, `hr@`, `fleet@`, `finance@`, `accounts@`, `supervisor@` and
`viewer@demo-vendor.ae`. Override the owner with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` (the
password applies to every seeded user, and must satisfy the shared password policy). Re-seeding
resets those passwords and clears any lockout, so you cannot get locked out of a database you have
been reusing.

Signing in as each of those users is the quickest way to see the role-aware navigation and the
permission checks; see [`identity-and-tenancy.md`](identity-and-tenancy.md).

## Scripts

Run these from the repository root.

### Development

| Script            | Does                          |
| ----------------- | ----------------------------- |
| `npm run dev:api` | API in watch mode (port 3000) |
| `npm run dev:web` | Vite dev server (port 5173)   |

### Quality

| Script                 | Does                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `npm run verify`       | format check + lint + typecheck + tests + build - what CI runs |
| `npm run lint`         | ESLint across all three workspaces                             |
| `npm run lint:fix`     | ESLint with `--fix`                                            |
| `npm run format`       | Prettier write across the repo                                 |
| `npm run format:check` | Prettier check (CI uses this)                                  |
| `npm run typecheck`    | `tsc --noEmit` per workspace                                   |

### Tests

| Script                                          | Does                                       |
| ----------------------------------------------- | ------------------------------------------ |
| `npm test`                                      | all unit suites (shared, api, web)         |
| `npm run test:shared` / `test:api` / `test:web` | one workspace                              |
| `npm run test:e2e`                              | API end-to-end - **needs a live database** |

### Services

| Script                   | Does                                       |
| ------------------------ | ------------------------------------------ |
| `npm run services:up`    | start PostgreSQL + Redis, wait for healthy |
| `npm run services:down`  | stop them, keep the data                   |
| `npm run services:reset` | stop them and delete the volumes           |
| `npm run services:logs`  | tail container logs                        |

### Database

| Script                      | Does                                                 |
| --------------------------- | ---------------------------------------------------- |
| `npm run db:generate`       | regenerate the Prisma client                         |
| `npm run db:migrate`        | create/apply a migration in dev (prompts for a name) |
| `npm run db:migrate:deploy` | apply pending migrations without prompting (CI/prod) |
| `npm run db:migrate:status` | what is applied and what is pending                  |
| `npm run db:seed`           | run the seeders                                      |
| `npm run db:studio`         | Prisma Studio                                        |
| `npm run db:reset`          | **drops the database**, re-migrates, re-seeds        |

### Build

| Script                                             | Does                                                  |
| -------------------------------------------------- | ----------------------------------------------------- |
| `npm run build`                                    | shared -> api -> web, in that order                   |
| `npm run build:shared` / `build:api` / `build:web` | one workspace                                         |
| `npm run clean`                                    | remove `node_modules`, `dist` and coverage everywhere |

## Environment variables

`.env.example` documents every variable; it is the template for `.env`. The API validates them
at boot (`apps/api/src/config/env.schema.ts`) and refuses to start if anything is wrong,
listing every problem at once:

```
Invalid environment configuration:
  - DATABASE_URL: DATABASE_URL must be a postgres:// or postgresql:// connection string
  - JWT_SECRET: JWT_SECRET must be at least 32 characters
```

| Variable                             | Required | Notes                                                                 |
| ------------------------------------ | -------- | --------------------------------------------------------------------- |
| `NODE_ENV`                           | no       | `development` \| `test` \| `production`; defaults to `development`    |
| `PORT`                               | no       | defaults to `3000`                                                    |
| `API_PREFIX`                         | no       | defaults to `api/v1`; prefixes every route including health and docs  |
| `DATABASE_URL`                       | **yes**  | must be `postgres://` or `postgresql://`                              |
| `REDIS_URL`                          | **yes**  | must be `redis://` or `rediss://`                                     |
| `JWT_SECRET`                         | **yes**  | >= 32 chars; a placeholder is rejected in production                  |
| `JWT_ACCESS_EXPIRES_IN`              | no       | access-token life: `30s`, `15m`, `8h`, `7d`; defaults to `15m`        |
| `REFRESH_TOKEN_TTL_DAYS`             | no       | refresh/session life; defaults to `7`                                 |
| `REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS` | no       | used with "keep me signed in"; defaults to `30`, must be >= the above |
| `PASSWORD_RESET_TTL_MINUTES`         | no       | defaults to `30`                                                      |
| `EMAIL_VERIFICATION_TTL_HOURS`       | no       | defaults to `48`                                                      |
| `INVITATION_TTL_DAYS`                | no       | defaults to `7`                                                       |
| `LOGIN_MAX_FAILED_ATTEMPTS`          | no       | failures before lockout; defaults to `10`                             |
| `LOGIN_LOCKOUT_MINUTES`              | no       | defaults to `15`                                                      |
| `MAIL_DRIVER`                        | no       | `log` (default) writes messages to the logger; `noop` drops them      |
| `MAIL_FROM`                          | no       | envelope sender                                                       |
| `APP_WEB_URL`                        | no       | base URL used to build links inside emails                            |
| `CORS_ORIGIN`                        | no       | comma-separated origins; defaults to `http://localhost:5173`          |
| `LOG_LEVEL`                          | no       | `fatal`..`trace`, `silent`; defaults to `info`                        |
| `LOG_PRETTY`                         | no       | human-readable logs; defaults on in development only                  |
| `SWAGGER_ENABLED`                    | no       | defaults on outside production                                        |
| `VITE_API_BASE_URL`                  | no       | frontend -> API base URL, including the prefix                        |

Generate a secret with `openssl rand -base64 48`.

Files are read first-wins: `apps/api/.env.local` -> `apps/api/.env` -> `<root>/.env.local` ->
`<root>/.env`. Use the root `.env` unless you specifically need an API-only override. The
Prisma CLI does not know about workspaces, so the `db:*` scripts load the root `.env`
explicitly via `dotenv-cli`.

## Working on the database

Changing the schema:

1. Edit `apps/api/prisma/schema.prisma`.
2. `npm run db:migrate` - Prisma prompts for a name and writes
   `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`.
3. Commit the migration **with** the schema change. Never edit an applied migration; add a new
   one. CI fails on drift between the schema and the migrations.

To start over: `npm run db:reset` (destructive) or `npm run services:reset && npm run services:up`.

## Adding a seeder

Seeders live in `apps/api/prisma/seeders/`:

```ts
// apps/api/prisma/seeders/my-thing.seeder.ts
import { type Seeder } from './types';

export const myThingSeeder: Seeder = {
  name: 'my-thing',
  description: 'What this adds',
  async run({ prisma, log }) {
    // Must be idempotent - use upsert, not create.
    log('seeded my thing');
  },
};
```

Register it in `seeders/index.ts`; the array order is the run order. Keep datasets small -
volume data belongs in a separate generator, not in the seed CI runs on every push.

## Adding an endpoint

1. Put the request/response schema in `packages/shared` (Zod), so the web app validates with the
   same rule.
2. Validate with `@Body(new ZodValidationPipe(mySchema))`.
3. Return the payload directly - `ResponseEnvelopeInterceptor` adds the envelope.
4. Throw `AppException` for expected failures (`AppException.notFound('Client')`); never build an
   error response by hand.
5. Filter every Prisma query by `tenantId` from `@CurrentUser()`, never from the request.
6. Tag the controller with `@ApiTags(...)` and `@ApiStandardErrorResponses()`.
7. Consume it from the web app through the `api` helpers in `src/lib/apiClient.ts`, which unwrap
   the envelope.

## Conventions

- **Formatting and linting are not negotiable in CI.** Run `npm run format` before committing.
- **No `any`.** `@typescript-eslint/no-explicit-any` is an error in all three workspaces.
- **No `console` in API source.** Use the injected logger; `prisma/` is exempt (it is a CLI).
- **Strict TypeScript everywhere**, including `noUncheckedIndexedAccess` - index access yields
  `T | undefined`, so use `items[0]?.id`.
- **Prefix intentionally unused parameters with `_`** to satisfy both `tsc` and ESLint.

## Troubleshooting

**`Invalid environment configuration` on boot**
Exactly what it says - the message lists each bad variable. Compare with `.env.example`.

**`Can't reach database server at localhost:5432`**
Services are not up: `npm run services:up`. Verify with
`docker compose ps` (both should be `healthy`) or `pg_isready -h localhost -p 5432`.

**`health/redis` returns 503 but the API is fine**
By design: Redis is a supporting dependency, so the API stays up and readiness reports degraded.
Start Redis (`npm run services:up`); the client reconnects on its own, no API restart needed.

**Port already in use (3000 / 5173 / 5432 / 6379)**
Something else is bound. Change `PORT`/`POSTGRES_PORT`/`REDIS_PORT` in `.env`, or stop the other
process (`lsof -i :3000`).

**`Cannot find module '@vendoros/shared'` or stale shared types**
The apps consume the package's build output. Run `npm run build:shared`. (`npm install` does it
via the package's `prepare` script.)

**Prisma types do not match the schema**
`npm run db:generate` after every schema change.

**`P2002` / 409 from an endpoint**
A unique constraint was violated; the envelope's `error.details.fields` names the columns.

**`npm run test:e2e` fails to connect**
It needs a live database and applied migrations: `npm run services:up && npm run db:migrate:deploy`.

**Migration "already applied" or drift errors in a dev database**
`npm run db:reset` (destructive) is usually faster than reconciling by hand.

## Deployment

See [deployment.md](./deployment.md). In production, set every variable explicitly (no `.env`
file), keep `SWAGGER_ENABLED` unset unless docs should be public, run
`npm run db:migrate:deploy` as a release step, and point the platform's health check at
`/api/v1/health` (liveness) with `/api/v1/health/ready` for traffic gating.

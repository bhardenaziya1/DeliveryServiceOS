# VendorOS architecture

## Product boundary

VendorOS is a vendor-side operating system, not a dispatch/order management system. It sits
above client delivery platforms (the systems that actually dispatch orders to riders) and
manages everything the vendor needs to run its own business: workforce, fleet, contracts,
attendance, payroll, billing, settlements, and compliance.

## Commercial model (critical)

One **Client** can have many **Projects**. Each **Project** has its own **Contract** and
**Contract Versions**, and each Contract Version carries one or many **Rate Components** governed
by a declarative rule set:

- fixed amount
- per completed order
- per active worker
- per worker-day
- per shift
- per vehicle
- bonus / penalty
- percentage / adjustment
- hybrid combinations of the above

**A generic rate is never stored directly on `Client`.** Rates are scoped to a Project's Contract
Version, because two projects under the same client can have completely different commercial
terms (and a renegotiated contract must not silently change historical billing). This sprint
lands the `Client` → `Project` foundation; `Contract`, `ContractVersion` and `RateComponent`
tables are the next domain to build on top of it.

## Multi-tenancy

"Never trust `tenant_id` from the frontend" is enforced three times over, so no single mistake
exposes another tenant's data. [`docs/identity-and-tenancy.md`](identity-and-tenancy.md) covers
this in full; the shape of it:

- **The tenant comes from the token.** `JwtStrategy` re-fetches the user on every request and
  returns a `RequestUser` (`id`, `tenantId`, `email`, `fullName`, `roles`, `permissions`,
  `sessionId`) derived solely from the verified JWT. There is no request shape that supplies a
  tenant.
- **A client-supplied tenant id is refused.** `TenantContextGuard` publishes `request.tenantContext`
  and scrubs `tenantId` / `tenant_id` / `x-tenant-id` from the body, query and headers. One that
  matches the caller's own tenant is stripped; one naming a _different_ tenant is rejected with
  `403` and logged. Handlers read the tenant through `@TenantId()`, which only reads
  `tenantContext`.
- **Unscoped queries cannot reach the database.** Prisma middleware in `PrismaService` throws
  `MissingTenantScopeError` unless a query against a tenant-owned model names a tenant — in `where`
  for reads and writes, in `data` for creates, in both for an upsert. It understands compound
  uniques, relation filters and boolean combinators (an `OR` is only scoped if _every_ branch is).
  The cross-tenant reads authentication genuinely needs go through an explicit, commented
  `PrismaService.unscoped()`.

Every tenant-owned Prisma model carries a `tenantId` column and is indexed on `[tenantId, ...]`.
Services use `findFirst` (not `findUnique`) for by-id lookups, so a record from another tenant
returns `404`, not `403` — no tenant-existence leakage.

`apps/api/test/tenant-isolation.e2e-spec.ts` asserts all of this against a live database and the
real guard chain: Tenant A cannot list, read, search, update, delete or role-change any of
Tenant B's records, and cannot supply a tenant id in any position to change that.

## Repository layout

npm workspaces, one root `package.json`, three workspaces:

```
.
|- apps/
|  |- api/              NestJS 10 + Prisma 5 (REST, PostgreSQL, Redis)
|  |  |- prisma/        schema, migrations, seed runner + seeders
|  |  `- src/
|  |     |- config/     env schema + typed config accessor
|  |     |- common/     platform layer: errors, filters, interceptors,
|  |     |              logging, pipes, swagger, audit, and the
|  |     |              crypto / mail / rbac / tenancy building blocks
|  |     |- modules/    feature modules (health, auth, users, roles,
|  |     |              tenants, audit, clients, projects)
|  |     |- prisma/     PrismaService
|  |     `- redis/      RedisService
|  `- web/              React 18 + Vite 5 + MUI 6 + TanStack Query
|     `- src/
|        |- config/     validated browser env
|        |- layout/     AppShell: Sidebar, Topbar, AppLayout
|        |- lib/        API client (envelope unwrapping, token refresh),
|        |              session storage, hooks
|        |- routes/     ProtectedRoute, RequirePermission, <Can>
|        |- features/   feature slices
|        `- theme/      MUI theme
`- packages/
   `- shared/           Zod schemas, DTO types, enums, API contract
```

`packages/shared` is the only dependency edge between the two apps, and it points one way:
both `apps/api` and `apps/web` depend on it, and it depends on neither. A validation rule, an
enum or a response type is therefore defined once. Its `prepare` script builds it on
`npm install`, so a clean clone can typecheck the apps immediately.

TypeScript settings live in the root `tsconfig.base.json` and every workspace extends it.
Projects override module/emit options only, never the strict flags: `strict` plus
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `noUnusedLocals` and `noUnusedParameters`.

## Configuration

`apps/api/src/config/env.schema.ts` is the single source of truth for runtime configuration.
`ConfigModule.forRoot({ validate })` runs it before any provider is constructed, so an invalid
environment aborts the boot and prints every offending variable at once instead of failing
later as a confusing runtime error. The schema also coerces types (`PORT` becomes a number),
derives values (`CORS_ORIGINS` is the parsed list, `SWAGGER_ENABLED` defaults by `NODE_ENV`),
and refuses a placeholder `JWT_SECRET` when `NODE_ENV=production`.

Application code reads config through `AppConfigService`, which is typed against the schema -
there are no string keys or fallback defaults scattered through the codebase.

Env files are read in this order, first definition winning:
`apps/api/.env.local` -> `apps/api/.env` -> `<root>/.env.local` -> `<root>/.env`. The root
`.env` is the normal place to put things; `docker-compose.yml` reads it too.

The browser has its own validated config in `apps/web/src/config/env.ts`. Only `VITE_`-prefixed
variables reach the bundle, and everything in it is public by definition.

## Request lifecycle

```
request
  -> helmet, CORS
  -> pino-http            assigns/echoes x-request-id, logs the request
  -> JwtAuthGuard         verifies the bearer token, re-fetches the user
                          (global: protected unless @Public)
  -> TenantContextGuard   derives the tenant from that user; refuses a
                          client-supplied one
  -> PermissionsGuard     checks @RequirePermissions against the user's
                          resolved permissions
  -> ZodValidationPipe    parses body/query against the shared schema
  -> controller -> service -> Prisma (middleware rejects an unscoped query)
  -> ResponseEnvelopeInterceptor   wraps the payload in the success envelope
response

  any throw -> AllExceptionsFilter -> error envelope
```

The three guards are registered as `APP_GUARD`s in `AppModule` and run in that order, each relying
on the previous one. Being global is the point: a new controller is authenticated, tenant-scoped
and deny-by-default without anyone remembering to add anything, and the failure mode of forgetting
`@Public()` is a `401` on a route that should have been open — noticed immediately — rather than an
unauthenticated leak.

## API response contract

Every response uses one of two shapes, defined in `packages/shared/src/api/response.ts`:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "requestId": "...", "timestamp": "..." } }

// failure
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",       // stable, machine-readable
    "message": "Validation failed",   // human-readable, safe to display
    "fieldErrors": { "legalName": ["Legal name is required"] },
    "details": { }                    // optional machine-readable context
  },
  "meta": { "requestId": "...", "timestamp": "...", "path": "/api/v1/clients" }
}
```

`ResponseEnvelopeInterceptor` builds the success envelope; handlers just return their payload.
A handler returning `undefined` (a `204`) is passed through unwrapped, because a body on a
no-content response would be invalid.

Clients branch on `error.code` (`ApiErrorCode`), never on the message text, which may be
reworded or localised. `API_ERROR_STATUS` maps each code to its HTTP status so the two can
never drift apart. The frontend unwraps the envelope in exactly one place
(`apps/web/src/lib/apiClient.ts`), and `extractApiErrorMessage` / `extractApiFieldErrors` /
`extractApiErrorCode` read the error side.

## Error handling

`AllExceptionsFilter` (`APP_FILTER`, so it is also active in tests that import `AppModule`) is
the only place a thrown value becomes an HTTP response. It maps:

| Thrown                 | Status  | Code                                   |
| ---------------------- | ------- | -------------------------------------- |
| `AppException`         | its own | its own                                |
| `ZodError`             | 400     | `VALIDATION_ERROR`                     |
| `HttpException`        | its own | derived from the status                |
| Prisma `P2002`         | 409     | `CONFLICT` (with the offending fields) |
| Prisma `P2003`/`P2014` | 409     | `CONFLICT`                             |
| Prisma `P2025`         | 404     | `NOT_FOUND`                            |
| Prisma init/panic      | 503     | `DEPENDENCY_UNAVAILABLE`               |
| anything else          | 500     | `INTERNAL_ERROR`                       |

Two rules matter: **a 5xx never returns its own message** (Prisma errors and raw `Error`s carry
connection strings, host names and query shapes, so the client gets a generic sentence and the
detail goes to the log), and **only unexpected failures are logged at error level with a stack**

- an expected `404` is a `warn` line without one, so real problems stay visible.

Application code throws `AppException` (`AppException.notFound('Client')`,
`AppException.conflict(...)`, ...), which carries the `ApiErrorCode` through to the envelope.

## Logging and correlation

`nestjs-pino` emits structured JSON in production and human-readable lines in development
(`LOG_PRETTY`). Every line carries a `requestId`: an inbound `x-request-id` is honoured so a
trace survives across services, otherwise a UUID is generated. The same id is echoed in the
`x-request-id` response header and included in `meta.requestId` of every envelope, so a user
reporting an error can quote one value that finds the exact log lines.

`Authorization`, `Cookie`, `x-api-key`, `set-cookie` and password/token body fields are redacted
at the logger rather than relying on reviewers never to log a request body. Health probes are
excluded from request logging because they would otherwise dominate the output.

## Health and readiness

| Endpoint                   | Meaning                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `GET /api/v1/health`       | Liveness. 200 whenever the process serves HTTP; touches nothing. |
| `GET /api/v1/health/db`    | `SELECT 1` against PostgreSQL, with latency.                     |
| `GET /api/v1/health/redis` | `PING` against Redis (2s timeout), with latency.                 |
| `GET /api/v1/health/ready` | Aggregate; 503 while any dependency is down.                     |

All four are unauthenticated so load balancers and uptime monitors can reach them, and they
report status and latency only - never connection strings.

Liveness and readiness are deliberately separate: an orchestrator should not restart a healthy
process because Redis is briefly unreachable, it should stop sending it traffic. Redis is
treated as a supporting dependency - the connection is lazy and a Redis outage leaves the API
up and `ready` degraded rather than preventing boot. PostgreSQL is a hard dependency at boot
(`PrismaService.onModuleInit` connects), but an outage _after_ boot surfaces as
`health/db: down` rather than a crash.

## OpenAPI

`setupSwagger` (`apps/api/src/swagger.ts`) serves Swagger UI at `/api/v1/docs` and the raw spec
at `/api/v1/docs-json`. It is on outside production and can be enabled explicitly with
`SWAGGER_ENABLED=true`. The envelope is published as real schemas (`ApiErrorResponseDto` and
friends) and `@ApiStandardErrorResponses()` documents the errors every endpoint can return, so
the generated spec matches what the exception filter actually emits.

## Testing strategy

| Scope                                        | Runner                   | Location                           |
| -------------------------------------------- | ------------------------ | ---------------------------------- |
| Shared schemas and contract                  | Vitest                   | `packages/shared/src/**/*.spec.ts` |
| API units (services, filter, config, health) | Jest                     | `apps/api/src/**/*.spec.ts`        |
| API end-to-end (real Postgres)               | Jest                     | `apps/api/test/*.e2e-spec.ts`      |
| Web components and hooks                     | Vitest + Testing Library | `apps/web/src/**/*.test.tsx?`      |

Unit suites need no services: Prisma and Redis are injected mocks. The e2e suite needs a live
database and exercises the same pipeline as production, because the envelope interceptor and
exception filter are bound in `AppModule` rather than in `main.ts`.

## Seeding

`apps/api/prisma/seed.ts` is a runner: it owns connection handling, ordering, timing and exit
codes. Data lives in `prisma/seeders/*`, each exporting a `Seeder` (`name`, `description`,
`run`). Every seeder must be idempotent - `npm run db:seed` is expected to be safe to re-run -
and the baseline seeder is deliberately tiny (one tenant, one owner, one client, one project).
Volume data for performance work belongs in a separate, explicitly-invoked generator, not in
the seed every developer and CI run executes. Seeding refuses to run with
`NODE_ENV=production` unless `SEED_ALLOW_PRODUCTION=true`, because it resets the demo owner's
password.

## Continuous integration

`.github/workflows/ci.yml` has two jobs:

- **quality** - install, `prisma generate`, `format:check`, `lint`, `typecheck`, unit tests,
  build.
- **integration** - PostgreSQL 16 and Redis 7 service containers, `prisma migrate deploy`, a
  drift check (`prisma migrate diff --exit-code`), seed, build, then it boots the API with
  `NODE_ENV=production` and asserts the health endpoints, the envelope, `x-request-id`
  round-tripping and the OpenAPI document, before running the e2e suite.

## Domains shipped this sprint

- **Administration**: `Tenant`, `User`, `AuditLog`.
- **Identity and access**: tenant sign-up, invitations, email/password login (argon2id), rotating
  single-use refresh tokens with reuse detection, revocable sessions, password reset, email
  verification, and table-driven RBAC (`Role`, `Permission`, `RolePermission`, `UserRoleAssignment`)
  across the nine system roles. See [`identity-and-tenancy.md`](identity-and-tenancy.md).
- **Clients**: CRUD, tenant-scoped search/pagination/sort, audit trail, deletion blocked while
  projects exist (offboard via status instead).
- **Projects**: CRUD scoped to a client, tenant-unique project codes, audit trail.

## Domains intentionally deferred

Contracts, Rate Cards, Rule Engine, Workforce, Worker/Vehicle Documents, Fleet, Assignments,
Attendance, Leave, Productivity, Imports, Daily Operations, Payroll, Billing, Settlements,
Reconciliation, Exceptions, Expenses, Profitability, Compliance, Notifications, Reports,
Integrations. These build on the Client/Project foundation and are scoped for subsequent sprints
per the "one sprint at a time, full vertical slice" delivery rule.

## Audit trail

`AuditLog` is append-only: `AuditService.record()` only ever inserts rows (`CREATE`, `UPDATE`,
`DELETE`, `LOGIN`, `LOGIN_FAILED`), capturing `before`/`after` JSON snapshots. Corrections happen
by writing new rows, never by mutating or deleting existing audit entries. The same pattern will
back the immutable-locked-financial-period rule once Payroll/Billing land.

## Validation

`packages/shared` defines Zod schemas (`createClientSchema`, `createProjectSchema`,
`loginSchema`, `paginationQuerySchema`, …) that are the single source of truth for validation on
both sides:

- **API**: `ZodValidationPipe<S>` (`apps/api/src/common/pipes/zod-validation.pipe.ts`) parses
  `@Body()`/`@Query()` against the schema and throws a `400` with field-level errors on failure.
- **Web**: the same schema is passed to `zodResolver` for React Hook Form, so a rule (e.g. the
  UAE `+971XXXXXXXXX` phone format) is expressed once.

## Authorization

`PermissionsGuard` + `@RequirePermissions(...)` gate every route against the caller's resolved
permissions — never against role names, so adding a role never touches a guard and re-scoping one
never touches a controller. Clients and Projects need `clients:read` / `projects:read` to list,
`:create` / `:update` to modify and `:delete` to remove.

The catalogue lives in `packages/shared/src/rbac` and is read by both sides: the API seeds the
`roles` and `permissions` tables from it, and the React app filters its sidebar, routes and
buttons from the same definitions. The frontend copy is a usability layer only — `rbac.e2e-spec.ts`
proves that un-hiding a control achieves nothing. Role assignment additionally refuses
self-promotion, granting above your own rank, and demoting the last Super Admin.
See [`identity-and-tenancy.md`](identity-and-tenancy.md) for the full role/permission matrix.

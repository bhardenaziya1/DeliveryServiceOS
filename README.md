# VendorOS

VendorOS is a multi-tenant SaaS operating system for UAE manpower/fleet vendors who supply
riders/drivers and vehicles to multiple delivery/logistics companies. It sits above client
delivery platforms and manages vendor-side workforce, fleet, project contracts, project-specific
rate rules, attendance, productivity, payroll, billing, client settlements, reconciliation,
compliance, expenses and profitability. VendorOS is **not** a dispatch/order management
replacement.

See [`docs/development.md`](docs/development.md) for local setup, scripts and troubleshooting,
[`docs/architecture.md`](docs/architecture.md) for the platform layer, domain model and
commercial-model rules,
[`docs/identity-and-tenancy.md`](docs/identity-and-tenancy.md) for authentication, sessions,
tenant isolation and RBAC, [`docs/sprint-1.md`](docs/sprint-1.md) and [`docs/sprint-2.md`](docs/sprint-2.md) for what has
shipped so far,
[`docs/deployment.md`](docs/deployment.md) for a free-tier deployment walkthrough, and
[`docs/design-system.md`](docs/design-system.md) for the frontend's visual language (colors,
typography, shared components) that every screen — shipped or new — should follow.

## Monorepo layout

```
apps/
  api/      NestJS + Prisma + PostgreSQL backend (REST under /api/v1)
  web/      React + TypeScript + Vite + MUI frontend
packages/
  shared/   Zod schemas, DTO types and enums shared by api and web
docs/       Architecture and sprint documentation
```

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL and Redis)

## Getting started

```bash
cp .env.example .env    # one env file for the whole monorepo
npm install             # also builds packages/shared (its prepare script)

npm run services:up     # PostgreSQL + Redis, waits until both report healthy
npm run db:generate     # Prisma client
npm run db:migrate      # apply migrations
npm run db:seed         # tiny baseline dataset

npm run dev:api         # terminal 1
npm run dev:web         # terminal 2
```

`docs/development.md` covers every script, each environment variable, and what to do when
something breaks.

The API listens on `http://localhost:3000/api/v1`; the web app on `http://localhost:5173`.

| Endpoint               | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `/api/v1/health`       | liveness (no dependencies touched)          |
| `/api/v1/health/db`    | PostgreSQL connectivity + latency           |
| `/api/v1/health/redis` | Redis connectivity + latency                |
| `/api/v1/health/ready` | readiness; 503 while any dependency is down |
| `/api/v1/auth/*`       | sign-up, sign-in, refresh, logout, password |
| `/api/v1/users`        | team administration and invitations         |
| `/api/v1/audit-logs`   | the tenant's audit trail                    |
| `/api/v1/docs`         | Swagger UI                                  |
| `/api/v1/docs-json`    | OpenAPI document                            |

Every route is authenticated and permission-checked by default; the handful that are not are
marked `@Public()`. See [`docs/identity-and-tenancy.md`](docs/identity-and-tenancy.md) for the
full endpoint table and the permission each one requires.

The seed script creates a demo tenant with:

- one user per role, all with the password `DemoPassword123!`: `owner@` (Super Admin), `admin@`,
  `ops@`, `hr@`, `fleet@`, `finance@`, `accounts@`, `supervisor@` and `viewer@demo-vendor.ae`
- one client (Swift Logistics FZ-LLC) with one active project

Signing in as each of those users is the quickest way to see the role-aware navigation and the
permission checks in action.

## Scripts (run from the repo root)

| Command                                               | Description                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `npm run verify`                                      | format check + lint + typecheck + tests + build (what CI runs) |
| `npm run build`                                       | Build shared package, API and web app                          |
| `npm run lint`                                        | Lint all three workspaces                                      |
| `npm run format`                                      | Prettier write across the repo                                 |
| `npm run typecheck`                                   | Type-check all three workspaces                                |
| `npm run test`                                        | Shared, API (unit) and web tests                               |
| `npm run test:api`                                    | API unit tests (mocked Prisma/Redis, no services needed)       |
| `npm run test:web`                                    | Web component tests (Vitest + Testing Library)                 |
| `npm run test:shared`                                 | Shared schema and API-contract tests                           |
| `npm run services:up` / `:down` / `:reset`            | Manage the PostgreSQL + Redis containers                       |
| `npm run db:migrate` / `:deploy` / `:seed` / `:reset` | Prisma migrations and seeding                                  |

API end-to-end tests (`apps/api/test/*.e2e-spec.ts`) make real HTTP requests against a live
Postgres database and are not part of `npm run test`; run them with `npm run test:e2e` after
`npm run services:up && npm run db:migrate:deploy`.

## Engineering principles

- Strict multi-tenancy, enforced three times over: the tenant comes from the verified access
  token, `TenantContextGuard` refuses any tenant id the client supplies, and Prisma middleware
  throws if a query against a tenant-owned model does not name a tenant at all. Cross-tenant
  reads needed by authentication go through an explicit, commented `PrismaService.unscoped()`.
- Secure by default: authentication, tenant context and permission checks are global guards, so a
  new controller is protected without anyone remembering to add anything. Opting out is an
  explicit `@Public()`.
- Authorisation is decided against permissions, never role names, from one catalogue in
  `packages/shared/src/rbac` that both the API and the React app read — so the menu a user sees
  matches what the API will actually serve.
- Sessions are revocable: access tokens last 15 minutes and carry a session id, refresh tokens are
  single-use and rotate, and replaying a spent one revokes the whole session.
- Commercial rates never live on `Client`. They belong to a Project's Contract/Rate Components
  (upcoming sprint) — see `docs/architecture.md`.
- Append-only audit trail (`AuditLog`) for authentication, access-control and create/update/delete
  on business records.
- Validation is shared: the same Zod schemas in `packages/shared` back both the NestJS
  `ZodValidationPipe` and the React Hook Form resolvers, so frontend and backend validation can
  never drift apart.
- One response contract: every response is `{ success, data, meta }` or
  `{ success: false, error: { code, message, ... }, meta }`. Handlers return payloads; an
  interceptor and a single exception filter own the envelope, and clients branch on
  `error.code`, never on message text.
- Configuration is validated at boot. An invalid environment aborts startup with a list of
  every offending variable rather than failing later in a confusing way.
- Every log line and every response carries a `requestId` (honouring an inbound
  `x-request-id`), so one value ties a user's report to the exact log lines.

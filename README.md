# VendorOS

VendorOS is a multi-tenant SaaS operating system for UAE manpower/fleet vendors who supply
riders/drivers and vehicles to multiple delivery/logistics companies. It sits above client
delivery platforms and manages vendor-side workforce, fleet, project contracts, project-specific
rate rules, attendance, productivity, payroll, billing, client settlements, reconciliation,
compliance, expenses and profitability. VendorOS is **not** a dispatch/order management
replacement.

See [`docs/development.md`](docs/development.md) for local setup, scripts and troubleshooting,
[`docs/architecture.md`](docs/architecture.md) for the platform layer, domain model and
commercial-model rules, [`docs/sprint-1.md`](docs/sprint-1.md) for what has shipped so far,
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
| `/api/v1/docs`         | Swagger UI                                  |
| `/api/v1/docs-json`    | OpenAPI document                            |

The seed script creates a demo tenant with:

- login: `owner@demo-vendor.ae` / `Password123!`
- one client (Swift Logistics FZ-LLC) with one active project

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

- Strict multi-tenancy: every tenant-owned row carries `tenantId`, and every service derives
  tenant scope exclusively from the authenticated request (`RequestUser`, populated by
  `JwtStrategy`) — never from client-supplied body/query parameters.
- Commercial rates never live on `Client`. They belong to a Project's Contract/Rate Components
  (upcoming sprint) — see `docs/architecture.md`.
- Append-only audit trail (`AuditLog`) for authentication events and create/update/delete on
  business records.
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

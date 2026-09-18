# VendorOS

VendorOS is a multi-tenant SaaS operating system for UAE manpower/fleet vendors who supply
riders/drivers and vehicles to multiple delivery/logistics companies. It sits above client
delivery platforms and manages vendor-side workforce, fleet, project contracts, project-specific
rate rules, attendance, productivity, payroll, billing, client settlements, reconciliation,
compliance, expenses and profitability. VendorOS is **not** a dispatch/order management
replacement.

See [`docs/architecture.md`](docs/architecture.md) for the domain model and commercial-model
rules, and [`docs/sprint-1.md`](docs/sprint-1.md) for what has shipped so far.

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
npm install

# start Postgres + Redis
docker compose up -d

# configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# build the shared package (api/web import its compiled output during type checks)
npm run build:shared

# apply the database schema and seed a demo tenant
npm run prisma:migrate --workspace=apps/api
npm run prisma:seed --workspace=apps/api

# run the API and the web app in separate terminals
npm run dev:api
npm run dev:web
```

The API listens on `http://localhost:3000/api/v1` (Swagger docs at
`http://localhost:3000/api/v1/docs`). The web app runs on `http://localhost:5173`.

The seed script creates a demo tenant with:

- login: `owner@demo-vendor.ae` / `Password123!`
- one client (Swift Logistics FZ-LLC) with one active project

## Scripts (run from the repo root)

| Command | Description |
| --- | --- |
| `npm run build` | Build shared package, API and web app |
| `npm run lint` | Lint API and web app |
| `npm run typecheck` | Type-check shared, API and web app |
| `npm run test` | Run shared, API (unit) and web tests |
| `npm run test:api` | API unit tests (mocked Prisma, no DB required) |
| `npm run test:web` | Web component tests (Vitest + Testing Library) |
| `npm run test:shared` | Shared Zod schema tests |
| `npm run prisma:migrate` | Apply Prisma migrations (requires a running Postgres) |

API end-to-end tests (`apps/api/test/*.e2e-spec.ts`) exercise real HTTP requests against a live
Postgres database and are not part of `npm run test`; run them with
`npm run test:e2e --workspace=apps/api` after `docker compose up -d postgres` and running
migrations.

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

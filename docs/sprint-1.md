# Sprint 1 — Foundation, Administration/Auth, Clients, Projects

## Scope

This is the first sprint on a brand-new repository (no prior commits). It lands the monorepo
foundation and the first two full vertical slices per the "Client → Project" commercial-model
hierarchy described in the product brief, plus the multi-tenant administration/auth layer every
later domain depends on.

Delivered, each as a complete vertical slice (DB migration schema → domain/service → API →
frontend hooks → UI → validation → tests → docs):

- **Foundation**: npm-workspaces monorepo (`apps/api`, `apps/web`, `packages/shared`),
  `docker-compose.yml` for local Postgres + Redis, Prisma schema, shared Zod schemas/types
  consumed by both API validation and frontend forms.
- **Administration & Auth**: `Tenant`, `User` (role-based), `AuditLog` Prisma models; Argon2
  password hashing; JWT bearer auth (`POST /auth/login`, `GET /auth/me`); `RequestUser` derived
  exclusively from the verified token; `RolesGuard` + `@Roles()` for mutation authorization;
  append-only audit logging on login/create/update/delete.
- **Clients**: full CRUD API (`/clients`) tenant-scoped end-to-end, server pagination/search/sort,
  deletion blocked while projects exist; enterprise MUI list page (server-paginated DataGrid,
  debounced search, status filter, create/edit dialog, delete confirmation, snackbars, loading/
  empty/error states) plus create/edit form validated with the same Zod schema as the API.
- **Projects**: full CRUD API (`/projects`) scoped to a client within the tenant, tenant-unique
  project codes, list filterable by client; mirrored MUI list/detail UI with a client selector.
- **App shell**: persistent sidebar + topbar layout, protected routing, login page, dashboard
  placeholder naming the domains still to come.

Explicitly deferred to later sprints (per the product brief's domain list): Contracts, Rate
Cards, Rule Engine, Workforce, Worker/Vehicle Documents, Fleet, Assignments, Attendance, Leave,
Productivity, Imports, Daily Operations, Payroll, Billing, Settlements, Reconciliation,
Exceptions, Expenses, Profitability, Compliance, Notifications, Reports, Integrations. These
build directly on the `Client` → `Project` foundation shipped here.

## Acceptance criteria met

- [x] Prisma migration-ready schema (`apps/api/prisma/schema.prisma`) with `tenantId` on every
      tenant-owned model and indexes for tenant-scoped lookups.
- [x] Every Clients/Projects endpoint requires a valid JWT and derives `tenantId` solely from
      `RequestUser` — never from the request body/query (`ClientService`/`ProjectService` always
      filter by `{ tenantId: actor.tenantId }`; `apps/api/test/clients.e2e-spec.ts` proves cross-
      tenant isolation returns `404`, not leaked data).
- [x] Mutations authorized by role (`OWNER`/`ADMIN`/`OPS_MANAGER` write, `OWNER`/`ADMIN` delete).
- [x] Append-only `AuditLog` entries for login, login failure, and Client/Project create/update/
      delete.
- [x] Shared Zod validation: the same schema backs the NestJS `ZodValidationPipe` and the React
      Hook Form resolver, so the UAE phone format, project code format, etc. can't drift between
      frontend and backend.
- [x] Full vertical UI: server-paginated table, debounced search, filters, sticky/hover states via
      MUI DataGrid, create/edit dialogs, destructive-action confirmation, snackbars, loading/
      empty/error states — no mock screens.
- [x] Real tests for the business rules that matter this sprint: UAE phone/email/code validation
      (shared), tenant isolation and audit-trail side effects (API unit tests + e2e test), auth
      failure paths (wrong password, deactivated user, unknown email), and the client UI's
      validation/error/success paths (component tests).
- [x] Documentation updated: root `README.md` (setup, scripts), `docs/architecture.md` (domain
      model, multi-tenancy, commercial-model rule), this sprint doc.

## Verification results (run from repo root, 2026-09-18)

All commands below were run against this exact commit. Commands not listed were not run.

### `npm run lint`

```
apps/api: eslint "src/**/*.ts" "test/**/*.ts" → 0 problems
apps/web: eslint "src/**/*.{ts,tsx}" → 1 problem (0 errors, 1 warning)
  - AuthContext.tsx:48 react-refresh/only-export-components (a hook + provider share one
    file; harmless for a non-HMR-critical context file, left as a warning)
```

**Result: PASS** (0 errors)

### `npm run typecheck`

```
packages/shared: tsc -p tsconfig.json --noEmit → clean
apps/api:        tsc -p tsconfig.json --noEmit → clean
apps/web:        tsc -b --noEmit               → clean
```

**Result: PASS**

### `npm run test`

```
packages/shared (vitest): 3 files, 15 tests passed
apps/api (jest, mocked Prisma — no DB required): 3 suites, 13 tests passed
apps/web (vitest + Testing Library): 3 files, 8 tests passed
```

**Result: PASS — 36/36 tests passed**

Not run in this sandbox (no live Postgres/Docker daemon available): `apps/api/test/
clients.e2e-spec.ts`, which exercises real HTTP requests including the cross-tenant isolation
check, against a live database. Run it with:

```
docker compose up -d postgres
npm run prisma:migrate --workspace=apps/api
npm run test:e2e --workspace=apps/api
```

### `npm run build`

```
packages/shared: tsc (dual CJS + ESM output) → succeeded
apps/api:        nest build                  → succeeded
apps/web:        tsc -b && vite build         → succeeded
  (vite warns the main chunk is >500kB after minification — MUI + MUI X DataGrid; not an
  error, flagged here as a follow-up to consider route-based code-splitting)
```

**Result: PASS**

## Known follow-ups for the next sprint

- Frontend bundle is a single ~1.1MB chunk; add route-level `React.lazy` code-splitting once
  there are enough routes to make it worthwhile.
- Client/Project status filters currently filter the _current page_ client-side rather than the
  full result set server-side; once Contracts/Rate Cards add more list-heavy screens, promote
  status filtering into the API query (`ClientService.list`/`ProjectService.list` already accept
  a `where` builder that makes this a small addition).
- `Contract`, `ContractVersion`, and `RateComponent` Prisma models are the next domain: a Project
  can have multiple simultaneous rate components (fixed, per-order, per-worker, per-shift,
  per-vehicle, bonus/penalty, percentage), which is why they were deliberately not folded into
  `Project` itself this sprint.

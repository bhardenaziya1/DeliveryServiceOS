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

- Every tenant-owned Prisma model carries a `tenantId` column and is indexed on `[tenantId, ...]`.
- `JwtStrategy` re-fetches the user on every request and returns a `RequestUser` (`id`,
  `tenantId`, `email`, `fullName`, `role`) derived solely from the verified JWT.
- Every service method takes the tenant id from `RequestUser`, never from the request body or
  query string. `ClientService`/`ProjectService` always filter Prisma queries by
  `{ tenantId: actor.tenantId }` and use `findFirst` (not `findUnique`) for by-id lookups so a
  record from another tenant returns `404`, not `403` (no tenant-existence leakage).
- `apps/api/test/clients.e2e-spec.ts` asserts this directly: a client created under tenant A
  returns `404` when a tenant B user requests it by id, and never appears in tenant B's list.

## Domains shipped this sprint

- **Administration**: `Tenant`, `User` (role-based: `OWNER`, `ADMIN`, `OPS_MANAGER`, `FINANCE`,
  `VIEWER`), `AuditLog`.
- **Auth**: email/password login (Argon2-hashed passwords), JWT bearer sessions, `/auth/me`.
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

`RolesGuard` + `@Roles(...)` restrict mutations by `UserRole`: any authenticated tenant member
can read Clients/Projects, but only `OWNER`/`ADMIN`/`OPS_MANAGER` can create or update them, and
only `OWNER`/`ADMIN` can delete.

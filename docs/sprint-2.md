# Sprint 2 — Identity, tenancy and access control

## Scope

Sprint 1 shipped a minimal auth layer: one JWT, a `UserRole` enum column, and a `RolesGuard`
applied controller by controller. It was enough to log in and prove tenant scoping worked for two
domains, and it would not have survived the domains still to come.

This sprint replaces it with the identity architecture the rest of the product sits on:
table-driven RBAC, rotating sessions, the full password/invitation/verification lifecycle, and
tenant isolation that is enforced by the framework rather than by everyone remembering to write
`tenantId`.

[`identity-and-tenancy.md`](identity-and-tenancy.md) is the reference; this file records what
changed and why.

## What changed

**Entities.** Added `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`,
`refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`, `invitations` and
`invitation_roles`. `users` gained `status`, `emailVerifiedAt`, `passwordChangedAt`,
`failedLoginCount` and `lockedUntil`; `audit_logs` gained the actor's email, IP, user agent and
request id. The `UserRole` enum column is gone — roles are rows now.

**The nine roles.** Super Admin, Admin, Operations Manager, HR/Compliance, Fleet Manager, Finance
Manager, Accountant, Supervisor, Viewer. They and their permissions are defined once in
`packages/shared/src/rbac` and read by both sides: the API seeds the tables from it, the React app
filters its sidebar and routes from it.

**Authorization is by permission, not role.** `@RequirePermissions('clients:update')` rather than
`@Roles(OWNER, ADMIN)`. Adding a role no longer touches a guard; re-scoping one no longer touches a
controller.

**Guards are global.** `JwtAuthGuard` → `TenantContextGuard` → `PermissionsGuard` run as
`APP_GUARD`s, so a new controller is authenticated, tenant-scoped and deny-by-default without
anyone remembering to add anything. Opting out is an explicit `@Public()`, and the failure mode of
forgetting it is a `401` on a route that should have been open — noticed immediately — rather than
an unauthenticated leak.

**Sessions replaced the single long-lived JWT.** Access tokens now last 15 minutes and carry a
session id; refresh tokens are 32 random bytes, stored only as a SHA-256 digest, single-use, and
rotated on every exchange. Replaying a spent token is treated as theft: the whole session is
revoked and a `TOKEN_REUSE_DETECTED` audit entry is written. Because roles are re-read per request,
a demotion or a disable takes effect on the next call instead of at the token's expiry.

**Tenant isolation became structural.** Three layers, none of which relies on a reviewer noticing a
missing filter:

1. the tenant comes from the verified token;
2. `TenantContextGuard` scrubs a client-supplied tenant id and rejects a mismatched one with `403`;
3. Prisma middleware throws `MissingTenantScopeError` if a query against a tenant-owned model does
   not name a tenant at all.

Layer 3 immediately caught two real bugs in the sprint-1 code: `ClientService.remove` and
`ProjectService.remove` deleted by id alone. The preceding lookup was tenant-scoped so they were
not exploitable, but the delete statement itself carried no tenant — exactly the shape that becomes
a leak the first time someone reorders the code.

**The full account lifecycle.** Tenant sign-up, invitations (accepting is what creates the user, so
an unaccepted invitation never occupies the address), forgot/reset password, email verification,
self-service password change, session listing and revocation, and account lockout after repeated
failures. Transactional mail goes through a `MAILER` port with `log` and `noop` drivers, so a real
provider is one class.

**Frontend.** Sign-up, forgot/reset password, invitation acceptance, email verification and a
profile page with active sessions. The API client refreshes an expired access token transparently,
with single-flight de-duplication — without it, two requests failing at once would rotate the same
single-use token twice and the server would revoke the session. The sidebar, routes and in-page
controls are all permission-filtered.

## Acceptance criteria met

- [x] **Sign-up, sign-in and sign-out work.** `POST /auth/register` provisions a tenant and its
      first Super Admin in one transaction; `POST /auth/login` issues a session; `POST /auth/logout`
      revokes it — and the access token stops working immediately, not at its expiry
      (`auth.e2e-spec.ts`).
- [x] **Refresh rotation works.** The presented token is revoked and replaced in one transaction,
      and replaying a spent one kills the session, including the legitimate holder's newest token
      (`auth.e2e-spec.ts`, `token.service.spec.ts`).
- [x] **Unauthorized APIs are rejected.** Every route is protected by default; missing, malformed,
      forged and expired tokens all return the same `UNAUTHORIZED` envelope
      (`auth.e2e-spec.ts`).
- [x] **Tenant isolation tests pass.** `tenant-isolation.e2e-spec.ts` asserts against a live
      database that Tenant A cannot list, read, search, update, delete or role-change any of
      Tenant B's records, cannot supply a tenant id in body, query or header to change that, and
      cannot redirect a refresh token across the boundary.
- [x] **Role permissions are enforced on the backend and reflected in the frontend.**
      `rbac.e2e-spec.ts` drives all nine roles against every gated endpoint, including the
      escalation rules; `navConfig.test.ts` and `RequirePermission.test.tsx` assert the UI derives
      from the same catalogue.
- [x] **Audit events are created.** Sign-in, sign-out, token refresh and reuse, password change and
      reset, role changes, invitations and session revocations all write entries, with password
      hashes and token digests redacted from the snapshots.

## Verification

```
npm run verify                    → PASS
  format:check                    → clean
  lint                            → 0 errors (1 pre-existing react-refresh warning)
  typecheck                       → clean across all three workspaces
  test                            → 71 shared + 153 API + 41 web = 265 passing
  build                           → all three workspaces built

npm run test:e2e                  → 108 passing against a live PostgreSQL 16
  auth.e2e-spec.ts                → sign-up, sign-in, rotation, reuse, logout, reset, sessions
  tenant-isolation.e2e-spec.ts    → cross-tenant reads and writes
  rbac.e2e-spec.ts                → all nine roles against every gated endpoint
  clients.e2e-spec.ts             → client CRUD through the real guard chain
```

CI runs the e2e suite against a live Postgres service container, so the tenant-isolation and RBAC
guarantees are a merge gate rather than a claim.

## Deliberate trade-offs

**The refresh token is in `localStorage`, not an httpOnly cookie.** The cookie is stronger and XSS
cannot read it, but it needs cookie parsing, CSRF tokens and a same-site deployment, none of which
this split-origin SPA has. The compensating controls are real: 15-minute access tokens, single-use
rotating refresh tokens, hashed storage at rest, and server-side revocation on reuse. Moving to
cookies later changes `authStorage.ts` and the login handler, and nothing else.

**Permissions are resolved from the shared role definitions, not re-joined through
`role_permissions` on every request.** The seed keeps the table in step, and this keeps
authorization to one query per request instead of a three-table join. The table remains the source
of truth for the admin screens.

**Tenant scoping uses Prisma's `$use` middleware**, which is deprecated in favour of client
extensions. The middleware applies to every call site without changing any of them, which is what
makes it a real guarantee rather than a convention; an extension would require `.db` at hundreds of
call sites and a developer who forgot it would get no error. Worth revisiting when `$use` is
actually removed.

**Email is globally unique, not unique per tenant.** Login is by email alone, so the same address in
two tenants would make "which account is this?" ambiguous at exactly the moment it must not be. One
person needing accounts in two tenants would need either a tenant selector at login or a
distinguishing address.

## Known follow-ups

- Password reset and login are not rate-limited beyond per-account lockout. `RedisService` is
  already wired up and is the natural home for a per-IP limiter.
- Expired sessions, refresh tokens and one-time tokens are never pruned. A scheduled job should
  sweep them; the rows are small but they grow without bound.
- `@RequirePermissions` is AND-only. A route needing "either of these" would want an `anyOf`
  variant — the frontend's `hasAnyPermission` already has this shape.
- Tenant-defined roles: the schema supports them (`roles.isSystem`), but nothing creates them yet.
- Carried over from sprint 1: route-level code-splitting for the frontend bundle, and promoting
  list status filters from client-side into the API query.

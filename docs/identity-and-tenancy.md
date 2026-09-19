# Identity, tenancy and access control

How VendorOS decides **who you are**, **which tenant you are acting in**, and **what you may do** —
and how each of those is proven by a test rather than asserted in a comment.

## Entities

| Table                       | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `tenants`                   | One vendor company. Every business record hangs off exactly one.        |
| `users`                     | A person who can sign in. Belongs to exactly one tenant.                |
| `roles`                     | The nine system roles. Rows, not a database enum.                       |
| `permissions`               | The `resource:action` catalogue authorisation is decided against.       |
| `role_permissions`          | Which permissions a role grants.                                        |
| `user_roles`                | Which roles a user holds.                                               |
| `sessions`                  | One browser/device sign-in. Access tokens carry its id.                 |
| `refresh_tokens`            | A rotating, single-use chain, stored hashed.                            |
| `password_reset_tokens`     | Single-use, hashed, short-lived.                                        |
| `email_verification_tokens` | Same, plus the address being proven.                                    |
| `invitations`               | A pending join. Accepting it is what creates the `users` row.           |
| `audit_logs`                | Append-only trail of authentication, access-control and record changes. |

Roles and permissions are deliberately **global rows** rather than per-tenant: the catalogue is the
same for everyone, seeded from `packages/shared/src/rbac`, so re-scoping a role is a code change
plus a seed run instead of a hand-written `UPDATE` against production. `user_roles` is
tenant-scoped, because _who holds what_ is very much tenant business.

## Tenancy: three independent layers

The rule is "never trust `tenant_id` from the frontend". That is enforced three times over, so no
single mistake exposes another tenant's data.

**1. The tenant comes from the token.** `JwtStrategy` verifies the access token and re-reads the
user on every request. `RequestUser.tenantId` is the result of that read — there is no request
shape that supplies it.

**2. A client-supplied tenant id is refused.** `TenantContextGuard` publishes
`request.tenantContext` and scrubs `tenantId` / `tenant_id` / `x-tenant-id` from the body, query
and headers. A value that _matches_ the caller's own tenant is stripped and ignored; one naming a
**different** tenant is rejected with `403` and logged, because that is either a bug worth failing
loudly on or an attack worth refusing. Handlers read the tenant through the `@TenantId()`
decorator, which only ever reads `tenantContext`.

**3. Unscoped queries cannot reach the database.** `PrismaService` installs middleware that
inspects every operation against a tenant-owned model and throws `MissingTenantScopeError` unless
the query names a tenant — in `where` for reads and writes, in `data` for creates, in both for an
upsert. It understands compound uniques (`tenantId_code`), relation filters (`tenant: { id }`) and
boolean combinators, including the subtle case: an `OR` is only scoped if **every** branch is, since
one unscoped branch widens the result set back across the boundary.

Authentication genuinely needs cross-tenant reads — you cannot scope a login by tenant when the
email is the only thing you know. Those go through `PrismaService.unscoped()`, which lifts the
check for one `AsyncLocalStorage` context. There are four legitimate uses, all documented at the
call site: authenticating a login, redeeming an opaque token, provisioning a tenant, and
cross-tenant maintenance.

> The `await` inside `unscoped()` is load-bearing. A Prisma query is lazy, so returning the
> callback's promise un-awaited would resume the work after the store had already been torn down —
> and the exemption would silently not apply. `prisma.service.spec.ts` pins both the working shape
> and the broken one.

## Tokens and sessions

```
POST /auth/login
  -> session row  (tenantId, userId, rememberMe, expiresAt)
  -> access token  JWT { sub, tenantId, sid }, 15 minutes
  -> refresh token 32 random bytes, returned once, stored only as SHA-256
```

The access token carries **identifiers only**. Roles and permissions are resolved from the database
on every request, so a demotion or a revoked session takes effect on the next call rather than at
the token's natural expiry — which is what makes a short access token safe to hand out.

**Rotation.** `POST /auth/refresh` revokes the presented token and issues a new pair in one
transaction. **Reuse detection**: presenting an already-rotated token means either a stolen token or
a replayed one, and both are resolved the same way — revoke the entire session, write a
`TOKEN_REUSE_DETECTED` audit entry, and force a fresh login. The legitimate holder loses their
session too; that is the point.

**Remember me** only changes lifetimes (`REFRESH_TOKEN_TTL_DAYS` vs
`REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS`). The client expresses intent; the server decides the numbers.
A refresh token never outlives its session, so a long session still ends on schedule instead of
being extended indefinitely by use.

**Passwords** are argon2id with parameters written down in `PasswordService` rather than inherited
from library defaults. A login for an unknown email still performs a verification against a decoy
hash, so response time does not reveal which addresses are registered — and every failure path
returns the same message.

### Why the refresh token is in `localStorage`

An httpOnly, `SameSite` cookie is the stronger option and XSS cannot read it. It also needs
cookie parsing, CSRF tokens and a same-site deployment, none of which this split-origin SPA has
yet. What is in place instead: 15-minute access tokens, single-use rotating refresh tokens, hashed
storage at rest, and server-side session revocation on reuse. Moving to cookies later changes
`apps/web/src/lib/authStorage.ts` and the login handler, and nothing else.

## Authorisation

Authorisation is decided against **permissions**, never role names, so adding a role never touches a
guard and re-scoping one never touches a controller.

Three guards run globally, in order, declared in `AppModule`:

```
JwtAuthGuard        authenticates; everything is protected unless @Public()
TenantContextGuard  derives the tenant; refuses a client-supplied one
PermissionsGuard    checks @RequirePermissions against the resolved set
```

Being global is the point: a new controller is authenticated, tenant-scoped and deny-by-default
without anyone remembering to add anything. The failure mode of forgetting `@Public()` is a `401`
on a route that should have been open — noticed immediately — rather than an unauthenticated leak.

### Roles

| Role               | Rank | Scope                                                               |
| ------------------ | ---- | ------------------------------------------------------------------- |
| Super Admin        | 0    | Everything, including tenant settings and granting Super Admin.     |
| Admin              | 10   | Everything except tenant settings.                                  |
| Operations Manager | 20   | Clients, projects, workforce; reads fleet.                          |
| HR / Compliance    | 30   | Workforce and compliance; reads the audit trail.                    |
| Fleet Manager      | 30   | Vehicles and their compliance; reads commercial records.            |
| Finance Manager    | 30   | Payroll, invoicing, settlements; reads the audit trail.             |
| Accountant         | 40   | Raises invoices; reads payroll and finance but cannot approve them. |
| Supervisor         | 50   | Reads the workforce and fleet on their projects.                    |
| Viewer             | 60   | Read-only on clients, projects and reports.                         |

Lower rank binds tighter. `canManageRole` lets an actor manage roles **at or below** their own
privilege, never above — so an Admin can appoint another Admin but can neither mint a Super Admin
nor demote one. Combined with `roles:assign` (held only by Super Admin and Admin), that closes the
role-assignment escalation path. Three further rules live in `UserService.assignRoles`: you cannot
change your own roles, you cannot act on a user who outranks you, and the last Super Admin cannot
be demoted.

A role change or a disable **revokes the target's sessions**, so it takes effect at once instead of
lingering for the life of an access token.

### The frontend

`packages/shared/src/rbac` is the single source of truth, imported by both sides. The sidebar
filters itself (`visibleSections`), routes are wrapped in `RequirePermission`, and in-page
affordances use `<Can anyOf={[...]}>`. This is a **usability layer, not a security one** — every one
of those permissions is enforced by `PermissionsGuard`, and `rbac.e2e-spec.ts` proves that
un-hiding a button in devtools achieves nothing.

## Audit trail

Append-only: no code path updates or deletes an `audit_logs` row, and a correction is a new row.
Entries carry the actor, their email (denormalised, so the trail still reads correctly after a
rename), the IP, the user agent and the request id.

Recorded: `TENANT_CREATED`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `TOKEN_REFRESHED`,
`TOKEN_REUSE_DETECTED`, `SESSION_REVOKED`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`,
`PASSWORD_RESET_COMPLETED`, `EMAIL_VERIFICATION_SENT`, `EMAIL_VERIFIED`, `USER_INVITED`,
`USER_REGISTERED`, `USER_UPDATED`, `USER_DISABLED`, `ROLES_CHANGED`, plus `CREATE`/`UPDATE`/`DELETE`
on business records.

`before`/`after` snapshots are redacted before they are written: password hashes and token digests
never reach the trail, which is widely readable by anyone holding `audit:read`. An audit write that
fails is logged at error level but never fails the business operation it describes.

## Email

Auth flows depend on the `MAILER` port, never on a provider SDK. `MAIL_DRIVER=log` writes the
message — including the link a real user would click — to the structured logger, which is how
invitation and reset flows are exercised in development. `noop` drops everything. A real provider
is one class behind the same interface.

The e2e suite swaps in a `RecordingMailer` and reads the token out of the emailed link, so the reset
and invitation tests redeem a genuine token through the public endpoint rather than forging one in
the database.

## Endpoints

| Method | Path                    | Access                               |
| ------ | ----------------------- | ------------------------------------ |
| POST   | `/auth/register`        | public — creates a tenant            |
| POST   | `/auth/login`           | public                               |
| POST   | `/auth/refresh`         | public — the token is the credential |
| POST   | `/auth/forgot-password` | public — always 202                  |
| POST   | `/auth/reset-password`  | public                               |
| POST   | `/auth/verify-email`    | public                               |
| GET    | `/invitations/:token`   | public — preview                     |
| POST   | `/invitations/accept`   | public                               |
| GET    | `/auth/me`              | authenticated                        |
| POST   | `/auth/logout`          | authenticated                        |
| PATCH  | `/auth/password`        | authenticated                        |
| GET    | `/auth/sessions`        | authenticated                        |
| DELETE | `/auth/sessions/:id`    | authenticated — own only             |
| PATCH  | `/users/me`             | authenticated — own profile          |
| GET    | `/users`                | `users:read`                         |
| POST   | `/users/invitations`    | `users:invite`                       |
| PUT    | `/users/:id`            | `users:update`                       |
| PUT    | `/users/:id/roles`      | `roles:assign`                       |
| DELETE | `/users/:id/sessions`   | `sessions:revoke`                    |
| GET    | `/roles`                | `roles:read`                         |
| GET    | `/tenant`               | `tenant:read`                        |
| PATCH  | `/tenant`               | `tenant:update`                      |
| GET    | `/audit-logs`           | `audit:read`                         |

## Tests

Unit (`npm run test`, no database):

- `tenant-scope.spec.ts` — every operation shape against every tenant-owned model, including the
  `OR`-branch case.
- `tenant-context.guard.spec.ts` — a mismatched tenant id in the body, query, snake_case key or
  header is refused; an echoed own id is stripped.
- `permissions.guard.spec.ts` — deny-by-default, AND across permissions, OR across roles.
- `prisma.service.spec.ts` — the lazy-promise hazard in the `unscoped()` escape hatch.
- `token.service.spec.ts` — rotation, hashed storage, reuse detection, remember-me lifetimes.
- `auth.service.spec.ts` — lockout, timing-equalised unknown emails, reset and verification rules.
- `roles.spec.ts` (shared) — the permission matrix and every escalation rule.

End-to-end (`npm run test:e2e`, live Postgres, real guard chain):

- `tenant-isolation.e2e-spec.ts` — Tenant A cannot list, read, search, update, delete or
  role-change any of Tenant B's records, and cannot redirect a token across the boundary.
- `auth.e2e-spec.ts` — sign-up, sign-in, rotation, reuse detection, logout, reset, sessions.
- `rbac.e2e-spec.ts` — every role against every gated endpoint, plus the escalation rules.

```bash
npm run services:up && npm run db:migrate:deploy && npm run db:seed
npm run test:e2e
```

The seed creates one user per role under `demo-vendor`, all with password `DemoPassword123!`:
`owner@`, `admin@`, `ops@`, `hr@`, `fleet@`, `finance@`, `accounts@`, `supervisor@` and
`viewer@demo-vendor.ae`. Signing in as each is the quickest way to see the role-aware navigation.

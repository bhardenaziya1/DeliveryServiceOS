import { Prisma } from '@prisma/client';

/**
 * Every model whose rows belong to exactly one tenant.
 *
 * A query against one of these must name a `tenantId`. `assertTenantScope`
 * below is wired into Prisma as middleware, so this is enforced for the whole
 * process rather than being a rule reviewers have to remember.
 *
 * Models NOT listed here are global by design: `Role`, `Permission`,
 * `RolePermission` and `InvitationRole` are the shared RBAC catalogue.
 */
export const TENANT_SCOPED_MODELS = [
  'User',
  'UserRoleAssignment',
  'Session',
  'RefreshToken',
  'PasswordResetToken',
  'EmailVerificationToken',
  'Invitation',
  'AuditLog',
  'Client',
  'Project',
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

const TENANT_SCOPED = new Set<string>(TENANT_SCOPED_MODELS);

export function isTenantScopedModel(model: string | undefined): model is TenantScopedModel {
  return model !== undefined && TENANT_SCOPED.has(model);
}

/** Operations whose `args.where` must constrain the tenant. */
const WHERE_OPERATIONS = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Operations whose `args.data` must carry the tenant. */
const DATA_OPERATIONS = new Set<string>(['create', 'createMany']);

/**
 * Thrown when a tenant-owned model is queried without a tenant constraint.
 *
 * This is a programming error, never a user error - it is deliberately not an
 * `AppException`, so it surfaces as a 500 and a loud log line rather than
 * being mistaken for a validation failure and quietly returned to a client.
 */
export class MissingTenantScopeError extends Error {
  constructor(
    readonly model: string,
    readonly operation: string,
  ) {
    super(
      `${model}.${operation}() ran without a tenantId filter. Tenant-owned data must always be ` +
        `scoped by the authenticated request. If this query is genuinely cross-tenant ` +
        `(authentication lookups, tenant provisioning), wrap it in PrismaService.unscoped().`,
    );
    this.name = 'MissingTenantScopeError';
  }
}

/** Does this `where` fragment constrain `tenantId` at some level? */
function whereConstrainsTenant(where: unknown): boolean {
  if (where === null || typeof where !== 'object') return false;

  const clause = where as Record<string, unknown>;

  if (clause['tenantId'] !== undefined && clause['tenantId'] !== null) return true;

  // A compound unique such as `{ tenantId_email: { tenantId, email } }`.
  for (const [key, value] of Object.entries(clause)) {
    if (key.startsWith('tenantId_') && value !== null && typeof value === 'object') {
      const compound = value as Record<string, unknown>;
      if (compound['tenantId'] !== undefined) return true;
    }
  }

  // `{ tenant: { id: ... } }` is an equally valid way to pin the tenant.
  const tenant = clause['tenant'];
  if (tenant !== null && typeof tenant === 'object') {
    const tenantFilter = tenant as Record<string, unknown>;
    if (tenantFilter['id'] !== undefined || tenantFilter['slug'] !== undefined) return true;
  }

  // AND is a conjunction, so one scoped branch scopes the whole query.
  const and = clause['AND'];
  if (Array.isArray(and) && and.some(whereConstrainsTenant)) return true;
  if (
    and !== null &&
    typeof and === 'object' &&
    !Array.isArray(and) &&
    whereConstrainsTenant(and)
  ) {
    return true;
  }

  // OR is a disjunction: EVERY branch must be scoped, otherwise one unscoped
  // branch widens the result set back across the tenant boundary.
  const or = clause['OR'];
  if (Array.isArray(or) && or.length > 0 && or.every(whereConstrainsTenant)) return true;

  return false;
}

function dataCarriesTenant(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return false;

  if (Array.isArray(data)) {
    return data.length > 0 && data.every(dataCarriesTenant);
  }

  const record = data as Record<string, unknown>;
  if (record['tenantId'] !== undefined && record['tenantId'] !== null) return true;

  // `connect`/`connectOrCreate` through the `tenant` relation sets it just as well.
  const tenant = record['tenant'];
  return tenant !== null && typeof tenant === 'object';
}

/**
 * Throws unless this operation is constrained to a single tenant.
 *
 * Exported separately from the middleware so it can be unit-tested directly
 * against every operation shape, with no database in the loop.
 */
export function assertTenantScope(
  model: string | undefined,
  operation: string,
  args: unknown,
): void {
  if (!isTenantScopedModel(model)) return;

  const parameters = (args ?? {}) as Record<string, unknown>;

  if (WHERE_OPERATIONS.has(operation)) {
    if (!whereConstrainsTenant(parameters['where'])) {
      throw new MissingTenantScopeError(model, operation);
    }
    return;
  }

  if (DATA_OPERATIONS.has(operation)) {
    if (!dataCarriesTenant(parameters['data'])) {
      throw new MissingTenantScopeError(model, operation);
    }
    return;
  }

  // `upsert` needs both halves: the lookup and the row it would create.
  if (operation === 'upsert') {
    if (!whereConstrainsTenant(parameters['where']) || !dataCarriesTenant(parameters['create'])) {
      throw new MissingTenantScopeError(model, operation);
    }
  }

  // Anything else (raw queries, $connect, ...) is out of scope for this check:
  // raw SQL is reviewed by hand and is not how business code reads data.
}

/**
 * Prisma middleware that applies {@link assertTenantScope} to every operation.
 *
 * It fails closed: a developer who forgets `tenantId` gets an exception on the
 * very first call in development, instead of a cross-tenant data leak in
 * production.
 */
export function tenantScopeMiddleware(isUnscoped: () => boolean): Prisma.Middleware {
  return async (params, next) => {
    if (!isUnscoped()) {
      assertTenantScope(params.model, params.action, params.args);
    }
    return next(params);
  };
}

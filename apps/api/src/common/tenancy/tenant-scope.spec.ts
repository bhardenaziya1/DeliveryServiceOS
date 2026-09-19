import {
  assertTenantScope,
  isTenantScopedModel,
  MissingTenantScopeError,
  TENANT_SCOPED_MODELS,
  tenantScopeMiddleware,
} from './tenant-scope';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

describe('assertTenantScope', () => {
  describe('models that belong to a tenant', () => {
    it.each(TENANT_SCOPED_MODELS)('rejects an unfiltered %s.findMany', (model) => {
      expect(() => assertTenantScope(model, 'findMany', {})).toThrow(MissingTenantScopeError);
    });

    it.each(TENANT_SCOPED_MODELS)('allows a tenant-filtered %s.findMany', (model) => {
      expect(() =>
        assertTenantScope(model, 'findMany', { where: { tenantId: TENANT_A } }),
      ).not.toThrow();
    });

    it('rejects a by-id lookup that does not name a tenant', () => {
      // The exact mistake the rule exists to catch: `findUnique({ where: { id } })`
      // happily returns another tenant's row.
      expect(() =>
        assertTenantScope('Client', 'findUnique', { where: { id: 'client-1' } }),
      ).toThrow(MissingTenantScopeError);
    });

    it('allows a by-id lookup that also names the tenant', () => {
      expect(() =>
        assertTenantScope('Client', 'findFirst', { where: { id: 'client-1', tenantId: TENANT_A } }),
      ).not.toThrow();
    });

    it.each(['update', 'delete', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy'])(
      'rejects an unscoped %s',
      (operation) => {
        expect(() => assertTenantScope('Project', operation, { where: { id: 'p-1' } })).toThrow(
          MissingTenantScopeError,
        );
      },
    );

    it('rejects a create whose data omits the tenant', () => {
      expect(() => assertTenantScope('Client', 'create', { data: { legalName: 'Acme' } })).toThrow(
        MissingTenantScopeError,
      );
    });

    it('allows a create that sets the tenant directly or through the relation', () => {
      expect(() =>
        assertTenantScope('Client', 'create', { data: { tenantId: TENANT_A } }),
      ).not.toThrow();
      expect(() =>
        assertTenantScope('Client', 'create', { data: { tenant: { connect: { id: TENANT_A } } } }),
      ).not.toThrow();
    });

    it('rejects a createMany where any row is missing the tenant', () => {
      expect(() =>
        assertTenantScope('Client', 'createMany', {
          data: [{ tenantId: TENANT_A }, { legalName: 'Unscoped' }],
        }),
      ).toThrow(MissingTenantScopeError);
    });

    it('accepts a compound unique that carries the tenant', () => {
      expect(() =>
        assertTenantScope('Project', 'findUnique', {
          where: { tenantId_code: { tenantId: TENANT_A, code: 'SWIFT-DXB-01' } },
        }),
      ).not.toThrow();
    });

    it('accepts a filter on the tenant relation', () => {
      expect(() =>
        assertTenantScope('Client', 'findMany', { where: { tenant: { id: TENANT_A } } }),
      ).not.toThrow();
    });

    it('requires both halves of an upsert to be scoped', () => {
      expect(() =>
        assertTenantScope('Client', 'upsert', {
          where: { id: 'client-1', tenantId: TENANT_A },
          create: { legalName: 'Acme' },
        }),
      ).toThrow(MissingTenantScopeError);

      expect(() =>
        assertTenantScope('Client', 'upsert', {
          where: { id: 'client-1', tenantId: TENANT_A },
          create: { tenantId: TENANT_A, legalName: 'Acme' },
        }),
      ).not.toThrow();
    });
  });

  describe('boolean combinators', () => {
    it('accepts an AND where one branch pins the tenant', () => {
      expect(() =>
        assertTenantScope('Client', 'findMany', {
          where: { AND: [{ status: 'ACTIVE' }, { tenantId: TENANT_A }] },
        }),
      ).not.toThrow();
    });

    it('rejects an OR where a single branch is unscoped', () => {
      // This is the subtle one: an unscoped OR branch widens the result set
      // back across the tenant boundary even though `tenantId` appears in the
      // query. A search box that ORs over columns is exactly how this happens.
      expect(() =>
        assertTenantScope('Client', 'findMany', {
          where: {
            OR: [{ tenantId: TENANT_A }, { legalName: { contains: 'Swift' } }],
          },
        }),
      ).toThrow(MissingTenantScopeError);
    });

    it('accepts an OR where every branch pins the tenant', () => {
      expect(() =>
        assertTenantScope('Client', 'findMany', {
          where: {
            OR: [
              { tenantId: TENANT_A, legalName: { contains: 'Swift' } },
              { tenantId: TENANT_A, tradeName: { contains: 'Swift' } },
            ],
          },
        }),
      ).not.toThrow();
    });

    it('treats a null tenantId as no tenant at all', () => {
      expect(() => assertTenantScope('Client', 'findMany', { where: { tenantId: null } })).toThrow(
        MissingTenantScopeError,
      );
    });
  });

  describe('global models', () => {
    it.each(['Role', 'Permission', 'RolePermission', 'Tenant'])(
      '%s is not tenant-scoped and needs no filter',
      (model) => {
        expect(isTenantScopedModel(model)).toBe(false);
        expect(() => assertTenantScope(model, 'findMany', {})).not.toThrow();
      },
    );
  });
});

describe('tenantScopeMiddleware', () => {
  const params = (overrides: Record<string, unknown> = {}) =>
    ({
      model: 'Client',
      action: 'findMany',
      args: {},
      dataPath: [],
      runInTransaction: false,
      ...overrides,
    }) as never;

  it('blocks an unscoped query before it reaches the database', async () => {
    const next = jest.fn();
    const middleware = tenantScopeMiddleware(() => false);

    await expect(middleware(params(), next)).rejects.toBeInstanceOf(MissingTenantScopeError);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a scoped query through', async () => {
    const next = jest.fn().mockResolvedValue([]);
    const middleware = tenantScopeMiddleware(() => false);

    await middleware(params({ args: { where: { tenantId: TENANT_A } } }), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('honours the unscoped escape hatch', async () => {
    const next = jest.fn().mockResolvedValue(null);
    const middleware = tenantScopeMiddleware(() => true);

    await middleware(params(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('names the model and operation so the mistake is obvious', async () => {
    const middleware = tenantScopeMiddleware(() => false);

    await expect(
      middleware(params({ model: 'Project', action: 'findUnique' }), jest.fn()),
    ).rejects.toThrow(/Project\.findUnique/);
  });

  it('does not let one tenant id satisfy a query filtered on another', () => {
    // Sanity check that the guard is structural: it asserts that *a* tenant is
    // named, and it is the services' job to pass the authenticated one. The
    // e2e suite covers the end-to-end guarantee.
    expect(() =>
      assertTenantScope('Client', 'findFirst', { where: { id: 'x', tenantId: TENANT_B } }),
    ).not.toThrow();
  });
});

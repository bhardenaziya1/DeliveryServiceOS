import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { tenantScopeMiddleware } from '../common/tenancy/tenant-scope';

/**
 * Owns the Prisma connection pool for the whole process.
 *
 * Two things beyond a plain client:
 *
 * 1. Prisma's own warnings/errors are forwarded to the structured logger
 *    instead of going to stdout unstructured.
 * 2. Every query against a tenant-owned model is required to name a tenant.
 *    The check runs as Prisma middleware, so it covers all call sites - a
 *    service that forgets `tenantId` throws instead of returning another
 *    tenant's rows.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'warn' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * Marks the current async context as exempt from the tenant-scope check.
   *
   * `AsyncLocalStorage` rather than a field, because a flag on the service
   * would leak the exemption across concurrent requests.
   */
  private readonly unscopedContext = new AsyncLocalStorage<true>();

  constructor(private readonly logger: PinoLogger) {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    this.logger.setContext(PrismaService.name);

    this.$on('warn', (event) => this.logger.warn({ target: event.target }, event.message));
    this.$on('error', (event) => this.logger.error({ target: event.target }, event.message));

    this.$use(tenantScopeMiddleware(() => this.unscopedContext.getStore() === true));
  }

  /**
   * Runs `fn` with the tenant-scope requirement lifted.
   *
   * There are exactly four legitimate reasons to reach for this, and all of
   * them are cases where the tenant is not yet known because establishing it
   * is the point of the query:
   *
   * - authenticating a login by email;
   * - redeeming an opaque token (refresh, password reset, verification,
   *   invitation), which is looked up by its hash;
   * - provisioning a brand-new tenant;
   * - background maintenance that intentionally spans tenants (token cleanup).
   *
   * Every call site is expected to carry a comment saying which. Anything
   * that serves a request on behalf of a signed-in user must not use it.
   */
  async unscoped<T>(fn: () => Promise<T>): Promise<T> {
    return this.unscopedContext.run(true, async () => {
      // The `await` is load-bearing. A Prisma query is lazy: calling
      // `findUnique(...)` only builds a thenable, and the middleware runs when
      // that thenable is awaited. Returning it from here un-awaited would
      // resume the work after `run()` has already exited, outside the store -
      // so the exemption would silently not apply.
      return await fn();
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

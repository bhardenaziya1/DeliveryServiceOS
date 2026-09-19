import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Regression cover for the tenant-scope escape hatch.
 *
 * `PrismaService.unscoped()` runs its callback inside an `AsyncLocalStorage`
 * store that the tenant-scope middleware reads. The subtlety is that a Prisma
 * query is *lazy*: calling `findUnique(...)` only builds a thenable, and the
 * middleware runs when that thenable is awaited. If the callback's promise is
 * returned without being awaited inside the store, the work resumes after
 * `run()` has exited and the exemption silently does not apply - which shows
 * up as every login failing with a 500.
 *
 * These tests model that with a lazy thenable rather than booting Prisma, so
 * the guarantee is pinned without a database.
 */
describe('unscoped context propagation', () => {
  const storage = new AsyncLocalStorage<true>();

  /** Stands in for a Prisma query: no work happens until `then` is called. */
  function lazyQuery(observe: (exempt: boolean) => void): PromiseLike<string> {
    return {
      then(onfulfilled) {
        observe(storage.getStore() === true);
        return Promise.resolve(onfulfilled ? onfulfilled('rows') : ('rows' as never));
      },
    };
  }

  it('sees the store when the callback is awaited inside it', async () => {
    const observed: boolean[] = [];

    const run = async <T>(fn: () => PromiseLike<T>): Promise<T> =>
      storage.run(true, async () => await fn());

    await run(() => lazyQuery((exempt) => observed.push(exempt)));

    expect(observed).toEqual([true]);
  });

  it('loses the store when the callback is returned un-awaited', async () => {
    // This is the shape that broke: `storage.run(true, fn)` where `fn` hands
    // back a lazy thenable. Documented here so the working version above is
    // not "simplified" back into it.
    const observed: boolean[] = [];

    const run = <T>(fn: () => PromiseLike<T>): PromiseLike<T> => storage.run(true, fn);

    await run(() => lazyQuery((exempt) => observed.push(exempt)));

    expect(observed).toEqual([false]);
  });

  it('does not leak the exemption to work outside the callback', async () => {
    const run = async <T>(fn: () => PromiseLike<T>): Promise<T> =>
      storage.run(true, async () => await fn());

    await run(() => lazyQuery(() => undefined));

    expect(storage.getStore()).toBeUndefined();
  });

  it('keeps concurrent callers independent', async () => {
    // A flag on the service (rather than a store) would let one unscoped call
    // exempt every other request in flight.
    const observed: boolean[] = [];

    const unscopedCall = async () =>
      storage.run(true, async () => await lazyQuery((exempt) => observed.push(exempt)));

    const scopedCall = async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return lazyQuery((exempt) => observed.push(exempt)).then(() => undefined);
    };

    await Promise.all([unscopedCall(), scopedCall()]);

    expect(observed).toContain(true);
    expect(observed).toContain(false);
  });
});

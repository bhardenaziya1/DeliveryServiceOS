import { HealthService } from './health.service';

describe('HealthService', () => {
  const config = { get: jest.fn().mockReturnValue('test') };

  function createService(overrides: { query?: jest.Mock; ping?: jest.Mock }) {
    const prisma = { $queryRaw: overrides.query ?? jest.fn().mockResolvedValue([{ 1: 1 }]) };
    const redis = { ping: overrides.ping ?? jest.fn().mockResolvedValue(1) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new HealthService(prisma as any, redis as any, config as any);
  }

  it('reports liveness without touching dependencies', () => {
    const query = jest.fn();
    const ping = jest.fn();

    const result = createService({ query, ping }).liveness();

    expect(result.status).toBe('ok');
    expect(result.environment).toBe('test');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(query).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
  });

  it('reports both dependencies up', async () => {
    const result = await createService({}).readiness();

    expect(result.status).toBe('ok');
    expect(result.dependencies.database.status).toBe('up');
    expect(result.dependencies.redis.status).toBe('up');
  });

  it('reports a database failure as degraded rather than throwing', async () => {
    const service = createService({
      query: jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5432')),
    });

    const result = await service.readiness();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.database).toMatchObject({
      status: 'down',
      error: 'ECONNREFUSED 127.0.0.1:5432',
    });
    // A Redis outage is independent of a Postgres outage.
    expect(result.dependencies.redis.status).toBe('up');
  });

  it('reports a redis failure as degraded', async () => {
    const service = createService({
      ping: jest.fn().mockRejectedValue(new Error('PING timed out')),
    });

    const result = await service.readiness();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.redis).toMatchObject({ status: 'down', error: 'PING timed out' });
  });
});

import { validateEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://vendoros:vendoros@localhost:5432/vendoros?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv({ ...valid });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api/v1');
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS).toBe(30);
    // Pretty logs and Swagger default on outside production.
    expect(env.LOG_PRETTY).toBe(true);
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('coerces PORT from a string', () => {
    expect(validateEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('splits CORS_ORIGIN into a trimmed list', () => {
    const env = validateEnv({
      ...valid,
      CORS_ORIGIN: 'http://localhost:5173, https://app.example.ae ,',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://app.example.ae']);
  });

  it('defaults pretty logs and Swagger off in production', () => {
    const env = validateEnv({ ...valid, NODE_ENV: 'production' });

    expect(env.LOG_PRETTY).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost:3306/x' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a non-redis REDIS_URL', () => {
    expect(() => validateEnv({ ...valid, REDIS_URL: 'http://localhost:6379' })).toThrow(
      /REDIS_URL/,
    );
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'too-short' })).toThrow(/at least 32/);
  });

  it('rejects a placeholder JWT_SECRET in production', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        JWT_SECRET: 'local-development-only-secret-change-me-32+',
      }),
    ).toThrow(/placeholder/);
  });

  it('rejects a malformed JWT_ACCESS_EXPIRES_IN', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_EXPIRES_IN: 'eight-hours' })).toThrow(
      /JWT_ACCESS_EXPIRES_IN/,
    );
  });

  it('rejects a remember-me lifetime shorter than the normal one', () => {
    expect(() =>
      validateEnv({
        ...valid,
        REFRESH_TOKEN_TTL_DAYS: '30',
        REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS: '7',
      }),
    ).toThrow(/REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS/);
  });

  it('reports every problem at once', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL[\s\S]*JWT_SECRET/);
  });
});

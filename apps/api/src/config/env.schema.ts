import { z } from 'zod';

/**
 * Single source of truth for the API's runtime configuration.
 *
 * The process refuses to boot when this schema does not parse, so a
 * misconfigured deploy fails immediately and loudly instead of surfacing as a
 * confusing runtime error much later.
 */

/**
 * Values that clearly came from a template rather than a secret manager. The
 * shipped `.env.example` secret matches these on purpose, so copying it and
 * deploying to production fails loudly instead of running with a known key.
 */
const PLACEHOLDER_SECRET_PATTERNS = [
  /change-?me/i,
  /placeholder/i,
  /example/i,
  /local-development/i,
  /^(secret|test|password)$/i,
];

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const postgresUrl = z
  .string()
  .min(1, 'DATABASE_URL is required')
  .refine(
    (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'DATABASE_URL must be a postgres:// or postgresql:// connection string',
  );

const redisUrl = z
  .string()
  .min(1, 'REDIS_URL is required')
  .refine(
    (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
    'REDIS_URL must be a redis:// or rediss:// connection string',
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z.string().trim().min(1).default('api/v1'),

    DATABASE_URL: postgresUrl,
    REDIS_URL: redisUrl,

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN must look like 30s, 15m, 8h or 7d')
      .default('8h'),

    /** Comma-separated list of allowed browser origins. */
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PRETTY: booleanish.optional(),
    SWAGGER_ENABLED: booleanish.optional(),
  })
  .superRefine((env, ctx) => {
    const isPlaceholder = PLACEHOLDER_SECRET_PATTERNS.some((pattern) =>
      pattern.test(env.JWT_SECRET),
    );

    if (env.NODE_ENV === 'production' && isPlaceholder) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must not be a placeholder value in production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    // Defaults that depend on NODE_ENV are resolved here so the rest of the
    // app never has to re-derive them.
    LOG_PRETTY: env.LOG_PRETTY ?? env.NODE_ENV === 'development',
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
    CORS_ORIGINS: env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  }));

export type AppEnv = z.infer<typeof envSchema>;

/**
 * `ConfigModule.forRoot({ validate })` hook. Returns the parsed (and coerced)
 * config, which becomes the object `ConfigService` reads from.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}\n`);
  }

  return result.data;
}

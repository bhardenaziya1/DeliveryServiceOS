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
    /**
     * Access-token lifetime. Deliberately short: a revoked session or a
     * changed role only takes effect once the access token is re-issued from
     * the refresh token, so this value is the worst-case staleness window.
     */
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, 'JWT_ACCESS_EXPIRES_IN must look like 30s, 15m, 8h or 7d')
      .default('15m'),

    /** Refresh-token (and session) lifetime for a normal sign-in. */
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    /** Refresh-token lifetime when the user ticked "keep me signed in". */
    REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(48),
    INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

    /** Consecutive failed logins before the account is locked. */
    LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(100).default(10),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

    /**
     * Transport for transactional mail. `log` writes the message (and the link)
     * to the structured logger, which is what local development and CI use;
     * a real provider driver slots in behind the same `MailerService` port.
     */
    MAIL_DRIVER: z.enum(['log', 'noop']).default('log'),
    MAIL_FROM: z.string().trim().min(3).default('VendorOS <no-reply@vendoros.local>'),

    /** Public base URL of the web app, used to build links inside emails. */
    APP_WEB_URL: z.string().trim().url().default('http://localhost:5173'),

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

    // A "remember me" session that outlives a normal one is the whole point of
    // the flag; the reverse is a configuration mistake that would silently
    // shorten sessions for the users who asked to stay signed in.
    if (env.REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS < env.REFRESH_TOKEN_TTL_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS'],
        message:
          'REFRESH_TOKEN_REMEMBER_ME_TTL_DAYS must be greater than or equal to REFRESH_TOKEN_TTL_DAYS',
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

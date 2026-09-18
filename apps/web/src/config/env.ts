import { z } from 'zod';

/**
 * Validated browser configuration.
 *
 * Vite inlines `import.meta.env` at build time, so a bad value is a build-time
 * or first-paint failure rather than a mystery 404 later. Only `VITE_`-prefixed
 * variables reach the bundle - never put a secret in one.
 */
const envSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .url('VITE_API_BASE_URL must be an absolute URL, e.g. http://localhost:3000/api/v1')
    .default('http://localhost:3000/api/v1'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid frontend environment configuration:\n${details}`);
}

export const env = {
  /** Base URL of the API, including the version prefix. */
  apiBaseUrl: parsed.data.VITE_API_BASE_URL.replace(/\/+$/, ''),
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
} as const;

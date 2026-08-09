import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const falseByDefaultBoolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    FRONTEND_ORIGIN: z.url(),
    SWAGGER_ENABLED: booleanFromString,
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    COOKIE_SECURE: falseByDefaultBoolean,
    AUTH_CODE_HASH_SECRET: z.string().min(32),
    SMTP_HOST: z.string().min(1).default('smtp.163.com'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_SECURE: booleanFromString,
    SMTP_FROM_ADDRESS: z.email(),
    SMTP_USERNAME: z.string().min(1),
    SMTP_AUTH_CODE: z.string().min(1),
    SMTP_FROM_NAME: z.string().min(1).default('小蓝书'),
    MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
    MEDIA_ROOT: z.string().min(1).default('../.data/media'),
    MEDIA_PUBLIC_BASE_URL: z
      .url()
      .default('http://127.0.0.1:3001/api/v1/media'),
    E2E_MEDIA_FAILURE_MARKER: z.string().min(1).optional(),
    E2E_TEST_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
    if (value.MAIL_TRANSPORT === 'memory' && value.NODE_ENV !== 'test') {
      context.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message: 'memory transport is allowed only in test',
      });
    }
    if (value.MAIL_TRANSPORT === 'memory' && !value.E2E_TEST_CODE) {
      context.addIssue({
        code: 'custom',
        path: ['E2E_TEST_CODE'],
        message: 'is required for memory transport',
      });
    }
    if (value.E2E_MEDIA_FAILURE_MARKER && value.NODE_ENV !== 'test') {
      context.addIssue({
        code: 'custom',
        path: ['E2E_MEDIA_FAILURE_MARKER'],
        message: 'is allowed only in test',
      });
    }
  });

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  values: Record<string, unknown>,
): AppEnvironment {
  const result = environmentSchema.safeParse(values);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

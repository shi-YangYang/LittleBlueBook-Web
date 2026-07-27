import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('fails without listing secret values when required configuration is absent', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'secret-database-url',
      }),
    ).toThrow(/REDIS_URL/);

    try {
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'secret-database-url',
      });
    } catch (error) {
      expect(String(error)).not.toContain('secret-database-url');
    }
  });

  it('coerces safe scalar configuration', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'test',
        PORT: '3101',
        DATABASE_URL: 'postgresql://localhost/example',
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_ORIGIN: 'http://localhost:3000',
        SWAGGER_ENABLED: 'false',
        AUTH_CODE_HASH_SECRET: 'test-only-auth-code-hash-secret-32-characters',
        SMTP_FROM_ADDRESS: 'sender@example.test',
        SMTP_USERNAME: 'sender@example.test',
        SMTP_AUTH_CODE: 'test-only-placeholder',
        MAIL_TRANSPORT: 'smtp',
      }),
    ).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3101,
      SWAGGER_ENABLED: false,
      SMTP_HOST: 'smtp.163.com',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      MAIL_TRANSPORT: 'smtp',
      MEDIA_ROOT: '../.data/media',
      MEDIA_PUBLIC_BASE_URL: 'http://127.0.0.1:3001/api/v1/media',
    });
  });

  it('requires secure cookies in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/example',
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_ORIGIN: 'https://example.com',
        AUTH_CODE_HASH_SECRET: 'test-only-auth-code-hash-secret-32-characters',
        SMTP_FROM_ADDRESS: 'sender@example.test',
        SMTP_USERNAME: 'sender@example.test',
        SMTP_AUTH_CODE: 'test-only-placeholder',
        MAIL_TRANSPORT: 'smtp',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('allows the non-delivery mail transport only in test', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        DATABASE_URL: 'postgresql://localhost/example',
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_ORIGIN: 'https://example.com',
        AUTH_CODE_HASH_SECRET: 'test-only-auth-code-hash-secret-32-characters',
        SMTP_FROM_ADDRESS: 'sender@example.test',
        SMTP_USERNAME: 'sender@example.test',
        SMTP_AUTH_CODE: 'test-only-placeholder',
        MAIL_TRANSPORT: 'memory',
        E2E_TEST_CODE: '246810',
      }),
    ).toThrow(/MAIL_TRANSPORT/);
  });
});

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
      }),
    ).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3101,
      SWAGGER_ENABLED: false,
    });
  });
});

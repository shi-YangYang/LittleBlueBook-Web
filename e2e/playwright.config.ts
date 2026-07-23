import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env.CI);
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://littlebluebook:littlebluebook-local@127.0.0.1:5432/littlebluebook';
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  ...(isCi ? { workers: 1 } : {}),
  reporter: isCi
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter backend dev',
      url: 'http://127.0.0.1:3001/health/live',
      reuseExistingServer: !isCi,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        FRONTEND_ORIGIN: 'http://127.0.0.1:3000',
        SWAGGER_ENABLED: 'true',
      },
    },
    {
      command: 'pnpm --filter frontend dev',
      url: 'http://127.0.0.1:3000/healthz',
      reuseExistingServer: !isCi,
      timeout: 120_000,
      env: {
        BACKEND_URL: 'http://127.0.0.1:3001',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
      },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env.CI);
const baseURL = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

const browsers = [
  {
    name: 'chromium',
    browserName: 'chromium' as const,
    device: devices['Desktop Chrome'],
  },
  {
    name: 'firefox',
    browserName: 'firefox' as const,
    device: devices['Desktop Firefox'],
  },
  {
    name: 'webkit',
    browserName: 'webkit' as const,
    device: devices['Desktop Safari'],
  },
];

const viewports = [
  { width: 1280, height: 720, expectedColumns: 3 },
  { width: 1440, height: 900, expectedColumns: 4 },
  { width: 1920, height: 1080, expectedColumns: 5 },
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: 1,
  reporter: isCi
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  outputDir: 'test-results',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: browsers.flatMap((browser) =>
    viewports.map((viewport) => ({
      name: `${browser.name}-${viewport.width}`,
      metadata: {
        expectedColumns: viewport.expectedColumns,
        viewportWidth: viewport.width,
      },
      use: {
        ...browser.device,
        browserName: browser.browserName,
        viewport: {
          width: viewport.width,
          height: viewport.height,
        },
        ...(browser.name === 'chromium' && chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    })),
  ),
});

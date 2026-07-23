import { expect, test } from '@playwright/test';

test('renders the initialized LittleBlueBook homepage', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: '小蓝书' }),
  ).toBeVisible();
  await expect(page.getByText(/工程基础已初始化/)).toBeVisible();
});

test('reports frontend and backend health', async ({ request }) => {
  await expect(request.get('/healthz')).resolves.toMatchObject({
    ok: expect.any(Function),
  });

  const frontendHealth = await request.get('/healthz');
  expect(frontendHealth.ok()).toBe(true);
  await expect(frontendHealth.json()).resolves.toEqual({
    status: 'ok',
    service: 'frontend',
  });

  const backendLive = await request.get('http://127.0.0.1:3001/health/live');
  expect(backendLive.ok()).toBe(true);
  await expect(backendLive.json()).resolves.toEqual({
    status: 'ok',
    service: 'backend',
  });

  const backendReady = await request.get('http://127.0.0.1:3001/health/ready');
  expect(backendReady.status()).toBe(200);
  await expect(backendReady.json()).resolves.toEqual({
    status: 'ok',
    service: 'backend',
  });
});

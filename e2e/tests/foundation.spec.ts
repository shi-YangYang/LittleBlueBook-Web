import { expect, test } from '@playwright/test';

test('renders the SPEC-002 guest homepage shell', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('button', { name: '登录', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: '主要功能' }),
  ).toContainText('发现视频直播发布通知登录');
  await expect(
    page.getByRole('navigation', { name: '内容频道' }),
  ).toContainText('推荐数码汽车游戏运动健身户外穿搭美食职场情感家居旅行视频');
  await expect(page.getByLabel('推荐内容')).toBeVisible();
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

  const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
  const backendOrigin = new URL(apiUrl).origin;
  const backendLive = await request.get(`${backendOrigin}/health/live`);
  expect(backendLive.ok()).toBe(true);
  await expect(backendLive.json()).resolves.toEqual({
    status: 'ok',
    service: 'backend',
  });

  const backendReady = await request.get(`${backendOrigin}/health/ready`);
  expect(backendReady.status()).toBe(200);
  await expect(backendReady.json()).resolves.toEqual({
    status: 'ok',
    service: 'backend',
  });
});

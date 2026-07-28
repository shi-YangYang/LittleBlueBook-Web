import { expect, test } from '@playwright/test';

const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';

test('renders the SPEC-002 guest homepage shell', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('button', { name: '登录', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: '主要功能' }),
  ).toContainText('发现视频直播发布通知登录');
  const channelNavigation = page.getByRole('navigation', { name: '内容频道' });
  await expect(channelNavigation).toContainText(
    '推荐数码汽车游戏运动健身户外穿搭美食职场情感家居旅行其它',
  );
  await expect(
    channelNavigation.getByRole('button', { name: '视频', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('推荐内容')).toBeVisible();
});

test('loads public channels for a guest using the equivalent localhost origin', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The local CORS alias contract is browser-independent and runs once.',
  );

  const localUrl = new URL(frontendUrl);
  test.skip(
    localUrl.hostname !== '127.0.0.1',
    'The local alias regression requires a loopback E2E origin.',
  );
  localUrl.hostname = 'localhost';

  const channelResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/channels') &&
      response.request().method() === 'GET',
  );
  await page.goto(localUrl.origin);

  await expect(channelResponse).resolves.toMatchObject({
    ok: expect.any(Function),
  });
  expect((await channelResponse).status()).toBe(200);
  await expect(
    page.getByRole('navigation', { name: '内容频道' }),
  ).toContainText('推荐数码汽车游戏运动健身户外穿搭美食职场情感家居旅行其它');
  await expect(page.getByText('频道加载失败，请重试')).toHaveCount(0);
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === 'lbb_session',
    ),
  ).toBe(false);
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

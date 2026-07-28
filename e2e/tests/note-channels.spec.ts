import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const contentSession = 'spec004-content-session';
const blueImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);

const expectedChannels = [
  ['digital', '数码'],
  ['automotive', '汽车'],
  ['gaming', '游戏'],
  ['sports', '运动'],
  ['fitness', '健身'],
  ['outdoors', '户外'],
  ['fashion', '穿搭'],
  ['food', '美食'],
  ['workplace', '职场'],
  ['relationships', '情感'],
  ['home', '家居'],
  ['travel', '旅行'],
  ['other', '其它'],
];

async function addContentSession(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: 'lbb_session',
      value: contentSession,
      url: frontendUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

function multipart(
  title: string,
  channelCode: string,
  clientRequestId: string,
) {
  return {
    title,
    content: `频道正文：${title}`,
    channelCode,
    clientRequestId,
    images: {
      name: 'channel-note.png',
      mimeType: 'image/png',
      buffer: blueImage,
    },
  };
}

async function publish(
  request: APIRequestContext,
  title: string,
  channelCode: string,
  clientRequestId = randomUUID(),
) {
  return request.post(`${apiUrl}/notes`, {
    headers: { Cookie: `lbb_session=${contentSession}` },
    multipart: multipart(title, channelCode, clientRequestId),
  });
}

function feedNote(id: string, title: string) {
  return {
    id,
    title,
    cover: {
      url: `data:image/png;base64,${blueImage.toString('base64')}`,
      width: 16,
      height: 12,
    },
    author: {
      nickname: '频道蓝友',
      avatar: { type: 'initial', value: '频' },
    },
    likes: 0,
  };
}

test('exposes the authoritative channels and isolates API feeds and cursors', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The API contract is browser-independent and runs once.',
  );

  const channelsResponse = await request.get(`${apiUrl}/channels`);
  expect(channelsResponse.status()).toBe(200);
  const channels = (await channelsResponse.json()).data.items as Array<{
    code: string;
    name: string;
    displayOrder: number;
  }>;
  expect(channels.map(({ code, name }) => [code, name])).toEqual(
    expectedChannels,
  );
  expect(channels.map((channel) => channel.displayOrder)).toEqual(
    Array.from({ length: 13 }, (_, index) => index + 1),
  );
  expect(JSON.stringify(channels)).not.toContain('uncategorized');
  expect(JSON.stringify(channels)).not.toContain('视频');
  expect(channels[0]).not.toHaveProperty('id');
  expect(channels[0]).not.toHaveProperty('enabled');

  const suffix = Date.now();
  const digitalOneTitle = `数码频道一-${suffix}`;
  const digitalTwoTitle = `数码频道二-${suffix}`;
  const automotiveTitle = `汽车频道-${suffix}`;
  expect((await publish(request, digitalOneTitle, 'digital')).status()).toBe(
    201,
  );
  expect((await publish(request, digitalTwoTitle, 'digital')).status()).toBe(
    201,
  );
  expect((await publish(request, automotiveTitle, 'automotive')).status()).toBe(
    201,
  );

  const digitalResponse = await request.get(
    `${apiUrl}/notes/channels/digital?limit=1`,
  );
  expect(digitalResponse.status()).toBe(200);
  const digitalPage = (await digitalResponse.json()).data;
  expect(digitalPage.items).toHaveLength(1);
  expect(digitalPage.items[0].title).toBe(digitalTwoTitle);
  expect(digitalPage.nextCursor).toEqual(expect.any(String));

  const crossCursor = await request.get(
    `${apiUrl}/notes/channels/automotive?limit=20&cursor=${encodeURIComponent(
      digitalPage.nextCursor,
    )}`,
  );
  expect(crossCursor.status()).toBe(400);
  expect(await crossCursor.json()).toMatchObject({ code: 'CURSOR_INVALID' });

  const automotiveResponse = await request.get(
    `${apiUrl}/notes/channels/automotive?limit=20`,
  );
  const automotivePage = (await automotiveResponse.json()).data;
  expect(
    automotivePage.items.some(
      (item: { title: string }) => item.title === automotiveTitle,
    ),
  ).toBe(true);
  expect(
    automotivePage.items.some(
      (item: { title: string }) => item.title === digitalOneTitle,
    ),
  ).toBe(false);

  const recommendation = await request.get(
    `${apiUrl}/notes/recommendations?limit=20`,
  );
  const recommendationItems = (await recommendation.json()).data.items;
  for (const title of [digitalOneTitle, digitalTwoTitle, automotiveTitle]) {
    expect(
      recommendationItems.some(
        (item: { title: string }) => item.title === title,
      ),
    ).toBe(true);
  }

  const invalidFeed = await request.get(
    `${apiUrl}/notes/channels/uncategorized?limit=20`,
  );
  expect(invalidFeed.status()).toBe(404);
  expect(await invalidFeed.json()).toMatchObject({ code: 'CHANNEL_NOT_FOUND' });

  const invalidPublish = await publish(
    request,
    `内部频道-${suffix}`,
    'uncategorized',
  );
  expect(invalidPublish.status()).toBe(400);
  expect(await invalidPublish.json()).toMatchObject({
    code: 'CHANNEL_INVALID',
  });

  const idempotencyKey = randomUUID();
  const original = await publish(
    request,
    `幂等频道-${suffix}`,
    'digital',
    idempotencyKey,
  );
  const changedRetry = await publish(
    request,
    `幂等频道改参-${suffix}`,
    'automotive',
    idempotencyKey,
  );
  expect(original.status()).toBe(201);
  expect(changedRetry.status()).toBe(201);
  expect((await changedRetry.json()).data.id).toBe(
    (await original.json()).data.id,
  );
});

test('publishes a selected channel and follows the detail channel tag', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The full channel publishing flow runs once in Chromium.',
  );
  await addContentSession(context);
  const title = `频道界面-${Date.now()}`;

  await page.goto('/publish');
  await page.getByLabel('选择笔记图片').setInputFiles({
    name: 'channel-ui.png',
    mimeType: 'image/png',
    buffer: blueImage,
  });
  await page.getByLabel('标题').fill(title);
  await page.getByLabel('正文').fill('验证频道选择、详情标签和首页频道');
  await expect(page.getByRole('button', { name: '发布笔记' })).toBeDisabled();
  await page.getByRole('button', { name: '选择频道' }).click();
  await page.getByRole('radio', { name: '汽车' }).click();
  await page.getByRole('button', { name: '发布笔记' }).click();

  await expect(page).toHaveURL(/\/explore\/[0-9a-f-]{36}$/);
  const channelLink = page.getByRole('link', { name: '汽车' });
  await expect(channelLink).toBeVisible();
  await channelLink.click();
  await expect(page).toHaveURL(`${frontendUrl}/?channel=automotive`);
  await expect(page.getByRole('button', { name: '汽车' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page.getByRole('link', { name: `查看笔记：${title}` }),
  ).toBeVisible();
});

test('supports channel picker focus and URL history in each browser', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Focus and history behavior runs once per browser engine.',
  );
  await addContentSession(context);
  await page.goto('/publish');
  const trigger = page.locator('.channel-picker-trigger');
  await trigger.click();
  const first = page.getByRole('radio', { name: '数码' });
  await expect(first).toBeFocused();
  await first.press('ArrowRight');
  const second = page.getByRole('radio', { name: '汽车' });
  await expect(second).toBeFocused();
  await second.press('Enter');
  await expect(trigger).toContainText('汽车');
  await trigger.click();
  await second.press('Escape');
  await expect(trigger).toBeFocused();

  await page.goto('/');
  await page.getByRole('button', { name: '数码' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/?channel=digital`);
  await page.getByRole('button', { name: '汽车' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/?channel=automotive`);
  await page.goBack();
  await expect(page).toHaveURL(`${frontendUrl}/?channel=digital`);
  await expect(page.getByRole('button', { name: '数码' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.goForward();
  await expect(page).toHaveURL(`${frontendUrl}/?channel=automotive`);
});

test('keeps every channel accessible at the minimum 960x600 viewport', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The minimum supported viewport regression runs once in Chromium.',
  );
  await page.setViewportSize({ width: 960, height: 600 });
  await page.route('**/api/v1/auth/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          authenticated: true,
          user: {
            id: '00000000-0000-4000-8000-000000000105',
            email: 'content-author@example.com',
            nickname: '内容蓝友',
          },
        },
      },
    });
  });
  await page.route('**/api/v1/channels**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          items: expectedChannels.map(([code, name], index) => ({
            code,
            name,
            displayOrder: index + 1,
          })),
        },
      },
    });
  });
  await page.goto('/publish');

  const trigger = page.locator('.channel-picker-trigger');
  await trigger.click();
  const panel = page.locator('.channel-picker-panel');
  const first = page.getByRole('radio', { name: '数码' });
  const last = page.getByRole('radio', { name: '其它' });
  await expect(first).toBeFocused();
  await first.press('End');
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();

  const geometry = await page.evaluate(() => {
    const panelElement = document.querySelector('.channel-picker-panel');
    const publishPageElement = document.querySelector('.publish-page');
    const lastOption = panelElement?.querySelector('button:last-child');
    if (!panelElement || !publishPageElement || !lastOption) {
      throw new Error('Channel picker geometry is unavailable.');
    }
    const panelRect = panelElement.getBoundingClientRect();
    const publishPageRect = publishPageElement.getBoundingClientRect();
    const lastRect = lastOption.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      panel: { top: panelRect.top, bottom: panelRect.bottom },
      publishPage: {
        top: publishPageRect.top,
        bottom: publishPageRect.bottom,
      },
      last: { top: lastRect.top, bottom: lastRect.bottom },
      panelOverflowY: getComputedStyle(panelElement).overflowY,
      panelScrollHeight: panelElement.scrollHeight,
      panelClientHeight: panelElement.clientHeight,
    };
  });
  console.info(
    `SPEC-006 minimum viewport geometry: ${JSON.stringify(geometry)}`,
  );
  expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.publishPage.top);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(
    geometry.publishPage.bottom,
  );
  expect(geometry.last.top).toBeGreaterThanOrEqual(geometry.panel.top);
  expect(geometry.last.bottom).toBeLessThanOrEqual(geometry.panel.bottom);

  await last.press('Enter');
  await expect(trigger).toContainText('其它');
  await expect(panel).toHaveCount(0);
});

test('keeps the channel skeleton visible briefly before a fast empty state', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The minimum loading duration is browser-independent and runs once.',
  );
  await page.route('**/api/v1/notes/channels/digital?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { data: { items: [], nextCursor: null } },
    });
  });

  await page.goto('/');
  const loadingStartedAt = Date.now();
  await page.getByRole('button', { name: '数码' }).click();
  const feedState = page.getByLabel('数码频道内容');
  await expect(feedState).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(150);
  await expect(feedState).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('该频道还没有笔记')).toBeVisible();
  expect(Date.now() - loadingStartedAt).toBeGreaterThanOrEqual(280);
});

test('ignores a stale channel response after a faster channel switch', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The request race is browser-independent and runs once.',
  );
  await page.route('**/api/v1/notes/channels/digital?**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          items: [
            feedNote('00000000-0000-4000-8000-000000000601', '延迟的数码笔记'),
          ],
          nextCursor: null,
        },
      },
    });
  });
  await page.route('**/api/v1/notes/channels/automotive?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          items: [
            feedNote('00000000-0000-4000-8000-000000000602', '立即的汽车笔记'),
          ],
          nextCursor: null,
        },
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '数码' }).click();
  await page.getByRole('button', { name: '汽车' }).click();
  await expect(page.getByText('立即的汽车笔记')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText('立即的汽车笔记')).toBeVisible();
  await expect(page.getByText('延迟的数码笔记')).toHaveCount(0);
});

test('shows invalid channel recovery without recommendation substitution', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'Invalid URL behavior is browser-independent and runs once.',
  );
  await page.goto('/?channel=uncategorized');
  await expect(page.getByText('频道不存在或已停用')).toBeVisible();
  await page.getByRole('button', { name: '返回推荐' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
  await expect(page.getByRole('button', { name: '推荐' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Dialog,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const testCode = process.env.E2E_TEST_CODE ?? '246810';
const contentSession = 'spec004-content-session';
const blueLandscape = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);
const bluePortrait = Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgA4AH/2Q==',
  'base64',
);

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

async function requestLoginCode(page: Page, email: string): Promise<void> {
  await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(email);
  await page.getByRole('checkbox', { name: '同意用户协议与隐私政策' }).check();
  const codeResponse = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/auth/email-code/request` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '获取验证码' }).click();
  expect((await codeResponse).status()).toBe(200);
  await page.getByLabel('验证码').fill(testCode);
  await page.getByRole('button', { name: '登录/注册' }).click();
}

function noteMultipart(
  clientRequestId: string,
  title: string,
  channelCode = 'digital',
) {
  return {
    title,
    content: '接口幂等正文',
    channelCode,
    clientRequestId,
    images: {
      name: 'safe.png',
      mimeType: 'image/png',
      buffer: blueLandscape,
    },
  };
}

async function publishThroughApi(
  request: APIRequestContext,
  clientRequestId: string,
  title: string,
  channelCode = 'digital',
) {
  return request.post(`${apiUrl}/notes`, {
    headers: { Cookie: `lbb_session=${contentSession}` },
    multipart: noteMultipart(clientRequestId, title, channelCode),
  });
}

function layoutNote(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `布局测试笔记 ${index}`,
    cover: {
      url: `data:image/jpeg;base64,${bluePortrait.toString('base64')}`,
      width: 12,
      height: 16,
    },
    author: {
      nickname: '内容蓝友',
      avatar: { type: 'initial', value: '内' },
    },
    likes: 0,
  };
}

async function openAuthenticatedPublishPage(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '我' })).toBeVisible();
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page).toHaveURL(`${frontendUrl}/publish`);
}

async function fillDirtyHistoryForm(page: Page, direction: string) {
  await page.getByLabel('选择笔记图片').setInputFiles({
    name: `${direction}-history-kept.png`,
    mimeType: 'image/png',
    buffer: blueLandscape,
  });
  await page.getByLabel('标题').fill(`浏览器${direction}后保留的标题`);
  await page.getByLabel('正文').fill(`浏览器${direction}后保留的正文`);
}

async function prepareForwardTarget(page: Page): Promise<void> {
  await openAuthenticatedPublishPage(page);
  await page.locator('.publish-exit').click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(`${frontendUrl}/publish`);
  await expect(
    page.getByRole('heading', { name: '发布图文笔记' }),
  ).toBeVisible();
}

function guardDialogSequence(page: Page, choices: boolean[]) {
  const messages: string[] = [];
  const types: string[] = [];
  const handler = async (dialog: Dialog) => {
    messages.push(dialog.message());
    types.push(dialog.type());
    const shouldConfirm = choices.shift();
    if (shouldConfirm === true) {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  };
  page.on('dialog', handler);
  return {
    messages,
    types,
    dispose: () => page.off('dialog', handler),
  };
}

async function traverseHistory(
  page: Page,
  direction: 'back' | 'forward',
): Promise<void> {
  await page.evaluate((historyDirection) => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.dataset.historyTraversalTrigger = historyDirection;
    trigger.textContent = `test-${historyDirection}`;
    trigger.style.position = 'fixed';
    trigger.style.inset = '0 auto auto 0';
    trigger.style.zIndex = '99999';
    trigger.addEventListener(
      'click',
      () => {
        trigger.remove();
        window.history[historyDirection]();
      },
      { once: true },
    );
    document.body.append(trigger);
  }, direction);
  await page
    .locator(`[data-history-traversal-trigger="${direction}"]`)
    .click({ timeout: 5_000 });
}

test('continues a direct guest publish visit after email login', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The guest continuation is a stateful flow verified once.',
  );

  await page.goto('/publish');
  await expect(page).toHaveURL(`${frontendUrl}/`);
  await expect(page.getByRole('dialog', { name: '邮箱登录' })).toBeVisible();
  await requestLoginCode(page, 'content-author@example.com');
  await expect(page).toHaveURL(`${frontendUrl}/publish`);
  await expect(
    page.getByRole('heading', { name: '发布图文笔记' }),
  ).toBeVisible();
});

test('retries dirty browser Back after cancelling the same traversal target', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'The history regression runs once per browser engine.',
  );
  await addContentSession(context);
  await openAuthenticatedPublishPage(page);
  await fillDirtyHistoryForm(page, '返回');
  const beforeLength = await page.evaluate(() => window.history.length);
  const dialogs = guardDialogSequence(page, [false, true]);

  await traverseHistory(page, 'back');
  await expect.poll(() => dialogs.messages.length, { timeout: 5_000 }).toBe(1);
  await expect(page).toHaveURL(`${frontendUrl}/publish`, { timeout: 5_000 });
  await expect(page.getByLabel('标题')).toHaveValue('浏览器返回后保留的标题');
  await expect(page.getByLabel('正文')).toHaveValue('浏览器返回后保留的正文');
  await expect(page.getByAltText('第1张预览')).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(beforeLength);

  await traverseHistory(page, 'back');
  await expect.poll(() => dialogs.messages.length, { timeout: 5_000 }).toBe(2);
  await expect(page).toHaveURL(`${frontendUrl}/`, { timeout: 5_000 });
  await page.waitForTimeout(250);
  expect(dialogs.types).toEqual(['beforeunload', 'beforeunload']);
  expect(await page.evaluate(() => window.history.length)).toBe(beforeLength);
  dialogs.dispose();
});

test('retries dirty browser Forward after cancelling the same traversal target', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'The history regression runs once per browser engine.',
  );
  await addContentSession(context);
  await prepareForwardTarget(page);
  await fillDirtyHistoryForm(page, '前进');
  const beforeLength = await page.evaluate(() => window.history.length);
  const dialogs = guardDialogSequence(page, [false, true]);

  await traverseHistory(page, 'forward');
  await expect.poll(() => dialogs.messages.length, { timeout: 5_000 }).toBe(1);
  await expect(page).toHaveURL(`${frontendUrl}/publish`, { timeout: 5_000 });
  await expect(page.getByLabel('标题')).toHaveValue('浏览器前进后保留的标题');
  await expect(page.getByLabel('正文')).toHaveValue('浏览器前进后保留的正文');
  await expect(page.getByAltText('第1张预览')).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(beforeLength);

  await traverseHistory(page, 'forward');
  await expect.poll(() => dialogs.messages.length, { timeout: 5_000 }).toBe(2);
  await expect(page).toHaveURL(`${frontendUrl}/`, { timeout: 5_000 });
  await page.waitForTimeout(250);
  expect(dialogs.types).toEqual(['beforeunload', 'beforeunload']);
  expect(await page.evaluate(() => window.history.length)).toBe(beforeLength);
  dialogs.dispose();
});

test('publishes ordered images and shows the same real note everywhere', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'The complete content flow runs once per browser engine.',
  );
  await addContentSession(context);
  const title = `真实笔记-${testInfo.project.name}-${Date.now()}`;

  await page.goto('/');
  await expect(page.getByRole('link', { name: '我' })).toBeVisible();
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page).toHaveURL(`${frontendUrl}/publish`);

  await page.getByLabel('选择笔记图片').setInputFiles([
    {
      name: 'landscape.png',
      mimeType: 'image/png',
      buffer: blueLandscape,
    },
    {
      name: 'portrait.jpg',
      mimeType: 'image/jpeg',
      buffer: bluePortrait,
    },
  ]);
  await expect(page.getByText('2/9')).toBeVisible();
  await page.getByRole('button', { name: '将第2张图片前移' }).click();
  await expect(page.getByAltText('第1张预览')).toHaveAttribute('src', /blob:/);
  await expect(page.getByText('封面', { exact: true })).toBeVisible();
  await page.getByLabel('标题').fill(title);
  await page.getByLabel('正文').fill('第一行正文\n第二行 #普通文字');
  await page.getByRole('button', { name: '选择频道' }).click();
  await page.getByRole('radio', { name: '数码' }).click();
  await page.getByRole('button', { name: '添加话题' }).click();
  await expect(page.getByRole('status')).toHaveText('功能正在开发中');

  const publishResponse = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/notes` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发布笔记' }).click();
  expect((await publishResponse).status()).toBe(201);
  await expect(page).toHaveURL(/\/explore\/[0-9a-f-]{36}$/);

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('link', { name: '数码' })).toBeVisible();
  await expect(page.getByText('第一行正文')).toBeVisible();
  await expect(page.getByText('内容蓝友')).toBeVisible();
  await expect(page.getByAltText('笔记图片 1')).toHaveAttribute(
    'src',
    /\.jpg$/,
  );
  await page.getByRole('button', { name: '下一张图片' }).click();
  await expect(page.getByAltText('笔记图片 2')).toHaveAttribute(
    'src',
    /\.png$/,
  );
  await page.getByLabel('点赞 0，功能正在开发中').click();
  await expect(page.getByRole('status')).toHaveText('功能正在开发中');

  const detailUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.goto('/');
  const publicCard = page.getByRole('link', { name: `查看笔记：${title}` });
  await expect(publicCard).toBeVisible();
  await expect(publicCard).toContainText('内容蓝友');
  await expect(publicCard.getByLabel('点赞 0')).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: '内容蓝友' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: `查看笔记：${title}` }),
  ).toBeVisible();

  await context.clearCookies();
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('returns from detail to its in-site source and falls back home for a direct visit', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Detail return behavior runs once per browser engine.',
  );
  await addContentSession(context);
  const title = `详情返回-${testInfo.project.name}-${Date.now()}`;
  const created = await publishThroughApi(request, randomUUID(), title);
  expect(created.status()).toBe(201);
  const noteId = (await created.json()).data.id as string;
  const detailPath = `/explore/${noteId}`;

  await page.goto('/');
  await page.getByRole('link', { name: `查看笔记：${title}` }).click();
  await expect(page).toHaveURL(`${frontendUrl}${detailPath}`);
  const backButton = page.getByRole('button', { name: '返回上一页' });
  await expect(backButton).toBeVisible();
  const detailRects = await page.evaluate(() => {
    const back = document
      .querySelector('.detail-back-button')
      ?.getBoundingClientRect();
    const media = document
      .querySelector('.detail-media')
      ?.getBoundingClientRect();
    return {
      overlaps:
        Boolean(back && media) &&
        back!.left < media!.right &&
        back!.right > media!.left &&
        back!.top < media!.bottom &&
        back!.bottom > media!.top,
    };
  });
  expect(detailRects.overlaps).toBe(false);
  await backButton.click();
  await expect(page).toHaveURL(`${frontendUrl}/`);

  await page.goto('/profile');
  await page.getByRole('link', { name: `查看笔记：${title}` }).click();
  await expect(page).toHaveURL(`${frontendUrl}${detailPath}`);
  await page.getByRole('button', { name: '返回上一页' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/profile`);

  await page.goto(detailPath);
  await page.getByRole('button', { name: '返回上一页' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
});

test('keeps one profile note row within the root viewport and allows a second row', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('chromium-'),
    'Exact root scroll geometry runs at all three Chromium viewports.',
  );
  await addContentSession(context);
  let noteCount = 1;
  const viewportWidth = testInfo.project.use.viewport?.width ?? 1280;
  const expectedColumns =
    viewportWidth >= 1920 ? 5 : viewportWidth >= 1440 ? 4 : 3;
  await page.route('**/api/v1/notes/mine?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          items: Array.from({ length: noteCount }, (_, index) =>
            layoutNote(index + 1),
          ),
          nextCursor: null,
        },
      },
    });
  });

  await page.goto('/profile');
  await expect(page.locator('.note-card')).toHaveCount(1);
  const oneRow = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(oneRow.scrollHeight - oneRow.clientHeight).toBeLessThanOrEqual(1);

  await page.getByRole('tab', { name: '收藏' }).click();
  await expect(page.getByText('还没有收藏内容')).toBeVisible();
  await page.getByRole('tab', { name: '点赞' }).click();
  await expect(page.getByText('还没有点赞内容')).toBeVisible();
  await page.getByRole('tab', { name: '笔记' }).click();

  noteCount = expectedColumns + 1;
  await page.reload();
  await expect(page.locator('.note-card')).toHaveCount(noteCount);
  const secondRow = await page.evaluate(() => {
    const lastCard = Array.from(document.querySelectorAll('.note-card')).at(-1);
    return {
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      lastCardBottom: lastCard?.getBoundingClientRect().bottom ?? 0,
    };
  });
  if (secondRow.scrollHeight > secondRow.clientHeight + 1) {
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
  }
  const lastCardBottom = await page
    .locator('.note-card')
    .last()
    .evaluate((element) => element.getBoundingClientRect().bottom);
  expect(lastCardBottom).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerHeight)) + 1,
  );
});

test('keeps the publish layout usable at every configured desktop viewport', async ({
  context,
  page,
}) => {
  await addContentSession(context);
  await page.goto('/publish');
  await expect(
    page.getByRole('heading', { name: '发布图文笔记' }),
  ).toBeVisible();
  await expect(page.locator('.publish-media-panel')).toBeVisible();
  await expect(page.locator('.publish-copy-panel')).toBeVisible();

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    mediaLeft:
      document.querySelector('.publish-media-panel')?.getBoundingClientRect()
        .left ?? 0,
    copyLeft:
      document.querySelector('.publish-copy-panel')?.getBoundingClientRect()
        .left ?? 0,
    topicBottom:
      document.querySelector('.topic-placeholder')?.getBoundingClientRect()
        .bottom ?? 0,
    submitTop:
      document.querySelector('.publish-submit')?.getBoundingClientRect().top ??
      0,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.documentHeight - layout.viewportHeight).toBeLessThanOrEqual(1);
  expect(layout.copyLeft).toBeGreaterThan(layout.mediaLeft);
  expect(layout.submitTop - layout.topicBottom).toBeGreaterThanOrEqual(16);

  const input = page.getByLabel('选择笔记图片');
  await input.setInputFiles(
    Array.from({ length: 3 }, (_, index) => ({
      name: `first-row-${index + 1}.png`,
      mimeType: 'image/png',
      buffer: blueLandscape,
    })),
  );
  const firstRow = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(firstRow.scrollHeight - firstRow.clientHeight).toBeLessThanOrEqual(1);

  await input.setInputFiles({
    name: 'second-row.png',
    mimeType: 'image/png',
    buffer: blueLandscape,
  });
  await expect(page.locator('.publish-image-item')).toHaveCount(4);
  const secondRow = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  if (secondRow.scrollHeight > secondRow.clientHeight + 1) {
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
  }
  const lastPreviewBottom = await page
    .locator('.publish-image-item')
    .last()
    .evaluate((element) => element.getBoundingClientRect().bottom);
  expect(lastPreviewBottom).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerHeight)) + 1,
  );
});

test('continuously adapts an empty publish page without height-specific layout gaps', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'Continuous resize geometry is browser-independent and uses Chromium once.',
  );
  await addContentSession(context);
  await page.setViewportSize({ width: 1273, height: 613 });
  await page.goto('/publish');

  for (const height of [613, 727, 839, 947]) {
    await page.setViewportSize({ width: 1273, height });
    await expect(
      page.getByRole('heading', { name: '发布图文笔记' }),
    ).toBeVisible();

    const rootLayout = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      rootLayout.scrollHeight - rootLayout.clientHeight,
    ).toBeLessThanOrEqual(1);
    expect(rootLayout.scrollWidth - rootLayout.clientWidth).toBeLessThanOrEqual(
      1,
    );
  }
});

test('enforces authentication, real media validation and idempotency at the API boundary', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'API boundary behavior is browser-independent.',
  );
  const unauthenticated = await request.post(`${apiUrl}/notes`, {
    multipart: noteMultipart(randomUUID(), '未登录笔记'),
  });
  expect(unauthenticated.status()).toBe(401);

  const invalidMedia = await request.post(`${apiUrl}/notes`, {
    headers: { Cookie: `lbb_session=${contentSession}` },
    multipart: {
      title: '伪造图片',
      content: '文件扩展名和声明类型不能作为唯一依据',
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'not-really-an-image.png',
        mimeType: 'image/png',
        buffer: Buffer.from('<svg><script>alert(1)</script></svg>'),
      },
    },
  });
  expect(invalidMedia.status()).toBe(400);
  expect(await invalidMedia.json()).toMatchObject({ code: 'IMAGE_INVALID' });

  const clientRequestId = randomUUID();
  const title = `幂等笔记-${Date.now()}`;
  const first = await publishThroughApi(request, clientRequestId, title);
  const second = await publishThroughApi(
    request,
    clientRequestId,
    `${title}-改参`,
    'automotive',
  );
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(201);
  const firstBody = await first.json();
  const secondBody = await second.json();
  expect(secondBody.data.id).toBe(firstBody.data.id);

  const feed = await request.get(`${apiUrl}/notes/recommendations?limit=20`);
  const feedText = await feed.text();
  expect(feed.status(), feedText).toBe(200);
  const feedBody = JSON.parse(feedText);
  const matching = feedBody.data.items.filter(
    (item: { title: string }) => item.title === title,
  );
  expect(matching).toHaveLength(1);
  expect(matching[0]).not.toHaveProperty('content');
  expect(matching[0].author).not.toHaveProperty('email');

  const media = await request.get(matching[0].cover.url);
  expect(media.ok()).toBe(true);
  expect(media.headers()['x-content-type-options']).toBe('nosniff');
  expect(matching[0].cover.url).not.toContain('test%5C');
  expect(matching[0].cover.url).not.toContain('spec004-e2e');
});

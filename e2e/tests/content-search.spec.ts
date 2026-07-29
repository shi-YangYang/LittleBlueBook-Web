import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const authorSession = 'spec008-author-session';
const viewerSession = 'spec008-viewer-session';
const authorId = '00000000-0000-4000-8000-000000000110';
const viewerId = '00000000-0000-4000-8000-000000000109';
const blueImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);

function cookie(session: string): Record<string, string> {
  return { Cookie: `lbb_session=${session}` };
}

async function publish(
  request: APIRequestContext,
  title: string,
  content: string,
  channelCode = 'digital',
): Promise<string> {
  const response = await request.post(`${apiUrl}/notes`, {
    headers: cookie(authorSession),
    multipart: {
      title,
      content,
      channelCode,
      clientRequestId: randomUUID(),
      images: {
        name: 'search-note.png',
        mimeType: 'image/png',
        buffer: blueImage,
      },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()).data as { id: string }).id;
}

test('positions the shared search dialog against the complete desktop viewport', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The shared dialog geometry runs once in Chromium.',
  );

  await page.context().addCookies([
    {
      name: 'lbb_session',
      value: viewerSession,
      url: 'http://127.0.0.1:3100',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  const entries = [
    {
      label: '首页',
      path: '/',
      triggerName: '搜索：搜索感兴趣的内容',
    },
    {
      label: '个人页',
      path: '/profile',
      triggerName: '搜索：搜索感兴趣的内容',
    },
    {
      label: '搜索页',
      path: '/search?keyword=%E6%90%9C%E7%B4%A2%E4%BD%9C%E8%80%85&type=user',
      triggerName: '搜索：搜索作者',
    },
    {
      label: '公开主页',
      path: `/users/${authorId}`,
      triggerName: '搜索：搜索感兴趣的内容',
    },
  ] as const;
  const viewports = [
    { width: 1440, height: 900 },
    { width: 960, height: 600 },
  ] as const;
  const geometrySamples: Array<{
    entry: string;
    viewport: string;
    centerOffset: number;
    dialogTop: number;
    dialogBottom: number;
  }> = [];

  for (const viewport of viewports) {
    for (const entry of entries) {
      await test.step(`${entry.label} ${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto(entry.path);
        await page.getByRole('button', { name: entry.triggerName }).click();

        const dialog = page.getByRole('dialog', { name: '搜索小蓝书' });
        await expect(dialog).toBeVisible();
        const geometry = await page.evaluate(() => {
          const dialogElement =
            document.querySelector<HTMLElement>('.search-modal');
          const layerElement = document.querySelector<HTMLElement>(
            '.search-modal-layer',
          );
          if (!dialogElement || !layerElement) {
            throw new Error('Search dialog geometry is unavailable.');
          }
          const dialogRect = dialogElement.getBoundingClientRect();
          const layerRect = layerElement.getBoundingClientRect();
          const root = document.documentElement;
          return {
            centerOffset:
              dialogRect.left + dialogRect.width / 2 - window.innerWidth / 2,
            dialogTop: dialogRect.top,
            dialogBottom: dialogRect.bottom,
            layerLeft: layerRect.left,
            layerRight: layerRect.right,
            dialogVerticalOverflow:
              dialogElement.scrollHeight > dialogElement.clientHeight,
            layerVerticalOverflow:
              layerElement.scrollHeight > layerElement.clientHeight,
            rootHorizontalOverflow: root.scrollWidth > root.clientWidth,
            rootOverflow: root.style.overflow,
            bodyOverflow: document.body.style.overflow,
          };
        });

        expect(Math.abs(geometry.centerOffset)).toBeLessThanOrEqual(2);
        expect(geometry.dialogTop).toBeGreaterThanOrEqual(16);
        expect(geometry.dialogBottom).toBeLessThanOrEqual(viewport.height);
        expect(Math.abs(geometry.layerLeft)).toBeLessThanOrEqual(1);
        expect(
          Math.abs(geometry.layerRight - viewport.width),
        ).toBeLessThanOrEqual(1);
        expect(geometry.dialogVerticalOverflow).toBe(false);
        expect(geometry.layerVerticalOverflow).toBe(false);
        expect(geometry.rootHorizontalOverflow).toBe(false);
        expect(geometry.rootOverflow).toBe('hidden');
        expect(geometry.bodyOverflow).toBe('hidden');
        geometrySamples.push({
          entry: entry.label,
          viewport: `${viewport.width}×${viewport.height}`,
          centerOffset: geometry.centerOffset,
          dialogTop: geometry.dialogTop,
          dialogBottom: geometry.dialogBottom,
        });
      });
    }
  }

  await testInfo.attach('search-dialog-geometry.json', {
    body: JSON.stringify(geometrySamples, null, 2),
    contentType: 'application/json',
  });
});

test('searches public note and user fields with ranking, privacy and formal video emptiness', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The PostgreSQL search contract runs once in Chromium.',
  );
  const suffix = Date.now();
  const exactTitle = `搜索排序${suffix}`;
  const exactId = await publish(
    request,
    exactTitle,
    `包含唯一正文词 户外体验${suffix}`,
  );
  await publish(request, `${exactTitle}进阶`, `另一篇正文 户外体验${suffix}`);

  const titleSearch = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent(exactTitle)}&limit=20`,
  );
  expect(titleSearch.status()).toBe(200);
  const titleBody = (await titleSearch.json()).data as {
    items: Array<{
      id: string;
      title: string;
      author: { nickname: string };
    }>;
  };
  expect(titleBody.items[0]).toMatchObject({
    id: exactId,
    title: exactTitle,
    author: { nickname: '搜索作者' },
  });

  const andSearch = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent(`搜索排序${suffix} 户外体验${suffix}`)}&limit=20`,
  );
  expect(andSearch.status()).toBe(200);
  expect(((await andSearch.json()).data.items as unknown[]).length).toBe(2);

  const authorSearch = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent('搜索作者')}&limit=20`,
  );
  const channelSearch = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent('数码')}&limit=20`,
  );
  expect(
    ((await authorSearch.json()).data.items as Array<{ id: string }>).some(
      (item) => item.id === exactId,
    ),
  ).toBe(true);
  expect(
    ((await channelSearch.json()).data.items as Array<{ id: string }>).some(
      (item) => item.id === exactId,
    ),
  ).toBe(true);

  const literalPatternSearch = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent('%_\\')}&limit=20`,
  );
  expect(literalPatternSearch.status()).toBe(200);
  expect((await literalPatternSearch.json()).data.items).toEqual([]);

  const userSearch = await request.get(
    `${apiUrl}/search/users?keyword=${encodeURIComponent('搜索作者')}&limit=20`,
  );
  expect(userSearch.status()).toBe(200);
  const userPayload = await userSearch.json();
  expect(userPayload.data.items[0]).toMatchObject({
    id: authorId,
    nickname: '搜索作者',
    littleBlueBookId: '0000000110',
  });
  expect(JSON.stringify(userPayload)).not.toContain('@example.com');
  expect(JSON.stringify(userPayload)).not.toContain('age');

  const idSearch = await request.get(
    `${apiUrl}/search/users?keyword=0000000110&limit=20`,
  );
  expect((await idSearch.json()).data.items[0].id).toBe(authorId);

  const videos = await request.get(
    `${apiUrl}/search/videos?keyword=${encodeURIComponent(exactTitle)}&limit=20`,
  );
  expect(videos.status()).toBe(200);
  expect((await videos.json()).data).toEqual({
    items: [],
    nextCursor: null,
  });

  const publicProfile = await request.get(
    `${apiUrl}/users/${authorId}/profile`,
  );
  const profilePayload = await publicProfile.json();
  expect(profilePayload.data).toMatchObject({
    id: authorId,
    nickname: '搜索作者',
    littleBlueBookId: '0000000110',
    gender: '保密',
  });
  expect(JSON.stringify(profilePayload)).not.toContain('search-author');
  expect(JSON.stringify(profilePayload)).not.toContain('email');

  const paginationKeyword = `稳定游标${suffix}`;
  const paginatedIds: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    paginatedIds.push(
      await publish(
        request,
        `${paginationKeyword}-${index}`,
        `真实多页搜索正文 ${paginationKeyword}`,
      ),
    );
  }
  const searchPage = async (cursor?: string) => {
    const parameters = new URLSearchParams({
      keyword: paginationKeyword,
      limit: '2',
    });
    if (cursor) parameters.set('cursor', cursor);
    const result = await request.get(
      `${apiUrl}/search/notes?${parameters.toString()}`,
    );
    expect(result.status()).toBe(200);
    return (await result.json()).data as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
  };
  const fullResult = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent(paginationKeyword)}&limit=20`,
  );
  expect(fullResult.status()).toBe(200);
  const fullIds = (
    (await fullResult.json()).data.items as Array<{ id: string }>
  ).map((item) => item.id);
  expect(new Set(fullIds)).toEqual(new Set(paginatedIds));

  const firstPage = await searchPage();
  const repeatedFirstPage = await searchPage();
  expect(repeatedFirstPage).toEqual(firstPage);
  expect(firstPage.nextCursor).not.toBeNull();

  const collectedIds = firstPage.items.map((item) => item.id);
  let nextCursor = firstPage.nextCursor;
  while (nextCursor) {
    const page = await searchPage(nextCursor);
    collectedIds.push(...page.items.map((item) => item.id));
    nextCursor = page.nextCursor;
  }
  expect(collectedIds).toEqual(fullIds);
  expect(new Set(collectedIds).size).toBe(collectedIds.length);

  const invalidCursor = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent(paginationKeyword)}&limit=2&cursor=not-a-cursor`,
  );
  expect(invalidCursor.status()).toBe(400);
  const crossKeywordCursor = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent(`${paginationKeyword}其它`)}&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
  );
  expect(crossKeywordCursor.status()).toBe(400);
  const crossEntityCursor = await request.get(
    `${apiUrl}/search/users?keyword=${encodeURIComponent(paginationKeyword)}&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
  );
  expect(crossEntityCursor.status()).toBe(400);
});

test('opens the modal, restores URL tabs and completes public-profile follow', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The related browser journey runs once in Chromium.',
  );
  const suffix = Date.now();
  const title = `模态搜索${suffix}`;
  await publish(request, title, `浏览器搜索正文${suffix}`);
  await request.delete(`${apiUrl}/users/${authorId}/follow`, {
    headers: cookie(viewerSession),
  });

  await page.goto('/');
  const trigger = page.getByRole('button', {
    name: '搜索：搜索感兴趣的内容',
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '搜索小蓝书' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('搜索内容')).toBeFocused();
  await dialog.getByLabel('搜索内容').fill(`  ${title}  `);
  await dialog.getByLabel('搜索内容').press('Enter');
  await expect(page).toHaveURL(
    `/search?keyword=${encodeURIComponent(title)}&type=note`,
  );
  await expect(
    page.getByRole('link', { name: `查看笔记：${title}` }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: '内容频道' })).toHaveCount(
    0,
  );

  await page.getByRole('tab', { name: '视频' }).click();
  await expect(page).toHaveURL(
    `/search?keyword=${encodeURIComponent(title)}&type=video`,
  );
  await expect(page.getByText('暂无视频内容')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: '视频' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.setViewportSize({ width: 960, height: 600 });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        horizontalOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        verticalOverflow:
          document.documentElement.scrollHeight >
          document.documentElement.clientHeight,
      })),
    )
    .toEqual({
      horizontalOverflow: false,
      verticalOverflow: false,
    });
  await page.setViewportSize({ width: 1087, height: 677 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: `搜索：${title}` }).click();
  await dialog.getByLabel('搜索内容').fill('搜索作者');
  await dialog.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(
    `/search?keyword=${encodeURIComponent('搜索作者')}&type=note`,
  );
  await page.getByRole('tab', { name: '用户' }).click();
  await expect(page).toHaveURL(
    /keyword=%E6%90%9C%E7%B4%A2%E4%BD%9C%E8%80%85&type=user/,
  );
  await page.getByRole('link', { name: '查看搜索作者的主页' }).click();
  await expect(page).toHaveURL(`/users/${authorId}`);
  await expect(page.getByRole('heading', { name: '搜索作者' })).toBeVisible();
  await expect(page.getByText('小蓝书号：0000000110')).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole('button', { name: '关注' }).click();
  const auth = page.getByRole('dialog', { name: '邮箱登录' });
  await auth.getByLabel('邮箱').fill('search-viewer@example.com');
  await auth.getByLabel('同意用户协议与隐私政策').check();
  await auth.getByRole('button', { name: '获取验证码' }).click();
  await expect(page.getByRole('status')).toContainText('验证码已发送');
  await auth.getByLabel('验证码').fill('246810');
  await auth.getByRole('button', { name: '登录/注册' }).click();
  await expect(auth).toBeHidden();
  await expect(page.getByRole('button', { name: '已关注' })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('tab', { name: '用户' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('link', { name: '查看搜索作者的主页' }),
  ).toBeVisible();

  await page.context().addCookies([
    {
      name: 'lbb_session',
      value: viewerSession,
      url: page.url().startsWith('http')
        ? new URL(page.url()).origin
        : 'http://127.0.0.1:3100',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto(`/users/${viewerId}`);
  await expect(page).toHaveURL('/profile');
});

import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const viewer = {
  id: '00000000-0000-4000-8000-000000000129',
  session: 'spec014-viewer-session',
  nickname: '管理访客蓝友',
};
const author = {
  id: '00000000-0000-4000-8000-000000000126',
  session: 'spec014-chromium-author-session',
  nickname: '管理铬蓝友',
};
const blueLandscape = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);

function cookie(session: string) {
  return { Cookie: `lbb_session=${session}` };
}

async function addSession(context: BrowserContext, session: string) {
  await context.addCookies([
    {
      name: 'lbb_session',
      value: session,
      url: frontendUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function setFollow(
  request: APIRequestContext,
  session: string,
  targetId: string,
  active: boolean,
) {
  return request.fetch(`${apiUrl}/users/${targetId}/follow`, {
    method: active ? 'PUT' : 'DELETE',
    headers: cookie(session),
  });
}

test('closes the following-feed and public social-graph browser flow', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1280',
    'SPEC-016 implementation runs one targeted Chromium flow only.',
  );
  await page.setViewportSize({ width: 960, height: 600 });
  await setFollow(request, viewer.session, author.id, false);
  await setFollow(request, author.session, viewer.id, false);

  const title = `关注流历史笔记-${Date.now()}`;
  const published = await request.post(`${apiUrl}/notes`, {
    headers: cookie(author.session),
    multipart: {
      title,
      content: '发生关注之前已发布的可见笔记',
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'following-feed-cover.png',
        mimeType: 'image/png',
        buffer: blueLandscape,
      },
    },
  });
  expect(published.status()).toBe(201);
  const noteId = (await published.json()).data.id as string;

  try {
    let privateFeedRequests = 0;
    page.on('request', (browserRequest) => {
      if (browserRequest.url().includes('/notes/following')) {
        privateFeedRequests += 1;
      }
    });
    await page.goto('/?feed=following');
    await expect(page).toHaveURL(/\?feed=following$/);
    await expect(page.getByRole('dialog', { name: '邮箱登录' })).toBeVisible();
    expect(privateFeedRequests).toBe(0);

    await page.getByRole('button', { name: '关闭登录弹窗' }).click();
    await addSession(context, viewer.session);
    expect(
      (await setFollow(request, viewer.session, author.id, true)).status(),
    ).toBe(200);
    expect(
      (await setFollow(request, author.session, viewer.id, true)).status(),
    ).toBe(200);

    const feedResponse = await request.get(`${apiUrl}/notes/following`, {
      headers: cookie(viewer.session),
    });
    expect(feedResponse.status()).toBe(200);
    const feed = (await feedResponse.json()).data as {
      items: Array<{ id: string; title: string }>;
    };
    expect(feed.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: noteId, title })]),
    );

    await page.reload();
    await expect(page.getByRole('button', { name: '关注' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText(title)).toBeVisible();

    await page.goto(`/users/${author.id}`);
    await page
      .getByRole('button', { name: new RegExp(`查看${author.nickname}的粉丝`) })
      .click();
    const signedInDialog = page.getByRole('dialog', { name: 'TA 的粉丝' });
    await expect(signedInDialog.getByText(viewer.nickname)).toBeVisible();
    await expect(
      page.locator('.public-profile-actions').getByText('互相关注'),
    ).toBeVisible();
    const bounds = await signedInDialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(960);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(600);
    await signedInDialog.getByRole('button', { name: '关闭粉丝列表' }).click();

    await context.clearCookies();
    await page.reload();
    const publicFollowersTrigger = page.getByRole('button', {
      name: new RegExp(`查看${author.nickname}的粉丝`),
    });
    await publicFollowersTrigger.click();
    const anonymousDialog = page.getByRole('dialog', { name: 'TA 的粉丝' });
    await expect(anonymousDialog.getByText(viewer.nickname)).toBeVisible();
    await anonymousDialog.getByRole('button', { name: '关注' }).click();
    await expect(page.getByRole('dialog', { name: '邮箱登录' })).toBeVisible();
  } finally {
    await setFollow(request, viewer.session, author.id, false);
    await setFollow(request, author.session, viewer.id, false);
    const editable = await request.get(`${apiUrl}/notes/${noteId}/edit`, {
      headers: cookie(author.session),
    });
    if (editable.status() === 200) {
      const contentVersion = (await editable.json()).data.contentVersion;
      await request.delete(`${apiUrl}/notes/${noteId}`, {
        headers: cookie(author.session),
        data: { expectedContentVersion: contentVersion },
      });
    }
  }
});

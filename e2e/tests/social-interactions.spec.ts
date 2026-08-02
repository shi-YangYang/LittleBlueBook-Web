import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const authorSession = 'spec007-author-session';
const viewerSession = 'spec007-viewer-session';
const thirdSession = 'spec007-third-session';
const authorId = '00000000-0000-4000-8000-000000000106';
const blueImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);

function cookie(session: string): Record<string, string> {
  return { Cookie: `lbb_session=${session}` };
}

async function addSession(
  context: BrowserContext,
  session: string,
): Promise<void> {
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

async function publish(
  request: APIRequestContext,
  title: string,
): Promise<string> {
  const response = await request.post(`${apiUrl}/notes`, {
    headers: cookie(authorSession),
    multipart: {
      title,
      content: `互动正文：${title}`,
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'social-note.png',
        mimeType: 'image/png',
        buffer: blueImage,
      },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()).data as { id: string }).id;
}

test('persists idempotent two-account interactions and enforces permissions', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The database and API contract is browser-independent and runs once.',
  );
  const title = `互动接口-${Date.now()}`;
  const noteId = await publish(request, title);

  const anonymousDetail = await request.get(`${apiUrl}/notes/${noteId}`);
  expect(anonymousDetail.status()).toBe(200);
  expect((await anonymousDetail.json()).data).toMatchObject({
    author: { id: authorId, nickname: '互动作者' },
    interactions: { likes: 0, favorites: 0, comments: 0 },
    viewer: {
      authenticated: false,
      liked: false,
      favorited: false,
      followingAuthor: false,
    },
  });

  for (const expectedActive of [true, true]) {
    const like = await request.put(`${apiUrl}/notes/${noteId}/like`, {
      headers: cookie(viewerSession),
    });
    expect(like.status()).toBe(200);
    expect((await like.json()).data).toEqual({
      active: expectedActive,
      count: 1,
    });
  }
  for (const expectedActive of [true, true]) {
    const favorite = await request.put(`${apiUrl}/notes/${noteId}/favorite`, {
      headers: cookie(viewerSession),
    });
    expect(favorite.status()).toBe(200);
    expect((await favorite.json()).data).toEqual({
      active: expectedActive,
      count: 1,
    });
  }
  for (const expectedFollowing of [true, true]) {
    const follow = await request.put(`${apiUrl}/users/${authorId}/follow`, {
      headers: cookie(viewerSession),
    });
    expect(follow.status()).toBe(200);
    expect((await follow.json()).data).toEqual({
      following: expectedFollowing,
    });
  }

  const commentResponse = await request.post(
    `${apiUrl}/notes/${noteId}/comments`,
    {
      headers: cookie(viewerSession),
      data: { content: '  两账号真实评论  ' },
    },
  );
  expect(commentResponse.status()).toBe(201);
  const commentResult = (await commentResponse.json()).data as {
    comment: { id: string; content: string; canDelete: boolean };
    total: number;
  };
  expect(commentResult).toMatchObject({
    comment: { content: '两账号真实评论', canDelete: true },
    total: 1,
  });

  const viewerDetail = await request.get(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(viewerSession),
  });
  expect((await viewerDetail.json()).data).toMatchObject({
    interactions: { likes: 1, favorites: 1, comments: 1 },
    viewer: {
      authenticated: true,
      liked: true,
      favorited: true,
      followingAuthor: true,
      canLike: true,
      canFollow: true,
    },
  });

  const liked = await request.get(`${apiUrl}/notes/liked?limit=20`, {
    headers: cookie(viewerSession),
  });
  const favorites = await request.get(`${apiUrl}/notes/favorites?limit=20`, {
    headers: cookie(viewerSession),
  });
  expect((await liked.json()).data.items[0]).toMatchObject({
    id: noteId,
    title,
    liked: true,
    likes: 1,
  });
  expect((await favorites.json()).data.items[0]).toMatchObject({
    id: noteId,
    title,
  });

  const viewerProfile = await request.get(`${apiUrl}/profile/me`, {
    headers: cookie(viewerSession),
  });
  expect((await viewerProfile.json()).data.stats.following).toBe(1);
  const authorProfile = await request.get(`${apiUrl}/profile/me`, {
    headers: cookie(authorSession),
  });
  expect((await authorProfile.json()).data.stats).toMatchObject({
    followers: 1,
    receivedLikesAndFavorites: 2,
  });

  const forbiddenDelete = await request.delete(
    `${apiUrl}/notes/${noteId}/comments/${commentResult.comment.id}`,
    { headers: cookie(thirdSession) },
  );
  expect(forbiddenDelete.status()).toBe(403);
  const authorDelete = await request.delete(
    `${apiUrl}/notes/${noteId}/comments/${commentResult.comment.id}`,
    { headers: cookie(authorSession) },
  );
  expect(authorDelete.status()).toBe(200);
  expect((await authorDelete.json()).data.total).toBe(0);

  expect(
    (
      await request.put(`${apiUrl}/notes/${noteId}/like`, {
        headers: cookie(authorSession),
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.put(`${apiUrl}/users/${authorId}/follow`, {
        headers: cookie(authorSession),
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(`${apiUrl}/notes/${noteId}/comments`, {
        headers: cookie(viewerSession),
        data: { content: ' ' },
      })
    ).status(),
  ).toBe(400);

  for (const expectedActive of [false, false]) {
    const unlike = await request.delete(`${apiUrl}/notes/${noteId}/like`, {
      headers: cookie(viewerSession),
    });
    expect((await unlike.json()).data).toEqual({
      active: expectedActive,
      count: 0,
    });
    const unfavorite = await request.delete(
      `${apiUrl}/notes/${noteId}/favorite`,
      { headers: cookie(viewerSession) },
    );
    expect((await unfavorite.json()).data).toEqual({
      active: expectedActive,
      count: 0,
    });
    const unfollow = await request.delete(
      `${apiUrl}/users/${authorId}/follow`,
      { headers: cookie(viewerSession) },
    );
    expect((await unfollow.json()).data).toEqual({
      following: expectedActive,
    });
  }
});

test('resumes anonymous card like after email login and exposes personal lists', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The full two-account browser flow runs once in Chromium.',
  );
  const title = `互动界面-${Date.now()}`;
  const noteId = await publish(request, title);

  await page.goto('/');
  const card = page.locator(`[data-note-id="${noteId}"]`);
  await expect(card.getByText(title)).toBeVisible();
  await card.getByRole('button', { name: /点赞，当前 0/ }).click();
  const loginDialog = page.getByRole('dialog', { name: '邮箱登录' });
  await expect(loginDialog).toBeVisible();
  await loginDialog
    .getByRole('textbox', { name: '邮箱' })
    .fill('social-viewer@example.com');
  await loginDialog.getByLabel('同意用户协议与隐私政策').check();
  await page.getByRole('button', { name: '获取验证码' }).click();
  await expect(page.getByRole('status')).toContainText('验证码已发送');
  await loginDialog.getByRole('textbox', { name: '验证码' }).fill('246810');
  await page.getByRole('button', { name: '登录/注册' }).click();
  await expect(loginDialog).toBeHidden();
  await expect(
    card.getByRole('button', { name: /取消点赞，当前 1/ }),
  ).toBeVisible();

  await card.getByRole('link', { name: `查看笔记：${title}` }).click();
  await page.getByRole('button', { name: /收藏，当前 0/ }).click();
  await expect(
    page.getByRole('button', { name: /取消收藏，当前 1/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: '关注' }).click();
  await expect(page.getByRole('button', { name: '已关注' })).toBeVisible();
  await page.getByRole('button', { name: '说点什么…' }).click();
  await page.getByLabel('评论内容').fill('浏览器真实评论');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('浏览器真实评论')).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByLabel('个人统计')).toContainText('关注1');
  await page.getByRole('tab', { name: '收藏' }).click();
  await expect(page.getByText(title)).toBeVisible();
  await page.getByRole('tab', { name: '点赞' }).click();
  const likedCard = page.locator(`[data-note-id="${noteId}"]`);
  await expect(likedCard.getByText(title)).toBeVisible();
  await likedCard.getByRole('button', { name: /取消点赞/ }).click();
  await expect(likedCard).toHaveCount(0);
});

test('keeps comment and dialog keyboard behavior across browser engines', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Browser-difference interaction checks run once per engine.',
  );
  const title = `互动键盘-${testInfo.project.name}-${Date.now()}`;
  const noteId = await publish(request, title);
  await addSession(context, viewerSession);
  await page.goto(`/explore/${noteId}`);

  await page.getByRole('button', { name: '说点什么…' }).click();
  await page.getByLabel('评论内容').fill('键盘删除确认');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('键盘删除确认')).toBeVisible();
  const deleteButton = page.getByRole('button', { name: '删除' });
  await deleteButton.click();
  const confirmation = page.getByRole('alertdialog', { name: '删除评论' });
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole('button', { name: '确认删除' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    confirmation.getByRole('button', { name: '取消' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    confirmation.getByRole('button', { name: '确认删除' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(confirmation).toHaveCount(0);
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  await confirmation.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('键盘删除确认')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '说点什么…' })).toBeFocused();

  await context.clearCookies();
  await page.reload();
  await page.getByRole('button', { name: /收藏，当前 0/ }).click();
  const authDialog = page.getByRole('dialog', { name: '邮箱登录' });
  await expect(authDialog).toBeVisible();
  await expect(authDialog.getByRole('textbox', { name: '邮箱' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(authDialog).toHaveCount(0);
});

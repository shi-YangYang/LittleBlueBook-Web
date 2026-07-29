import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const authorSession = 'spec009-author-session';
const viewerSession = 'spec009-viewer-session';
const authorId = '00000000-0000-4000-8000-000000000111';
const crossBrowserIdentities = {
  firefox: {
    authorSession: 'spec009-firefox-author-session',
    viewerSession: 'spec009-firefox-viewer-session',
    authorEmail: 'notification-firefox-author@example.com',
    viewerNickname: '火狐通知蓝友',
  },
  webkit: {
    authorSession: 'spec009-webkit-author-session',
    viewerSession: 'spec009-webkit-viewer-session',
    authorEmail: 'notification-webkit-author@example.com',
    viewerNickname: '织网通知蓝友',
  },
} as const;
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
  session = authorSession,
  title = `通知测试笔记-${Date.now()}`,
): Promise<string> {
  const response = await request.post(`${apiUrl}/notes`, {
    headers: cookie(session),
    multipart: {
      title,
      content: '用于验证互动通知闭环',
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'notification-note.png',
        mimeType: 'image/png',
        buffer: blueImage,
      },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()).data as { id: string }).id;
}

test('delivers, paginates, reads and navigates transactional interaction notifications', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'SPEC-009 implementation E2E runs once in Chromium.',
  );

  const noteId = await publish(request);
  const anonymous = await request.get(`${apiUrl}/notifications`);
  expect(anonymous.status()).toBe(401);

  for (const path of ['like', 'favorite']) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const interaction = await request.put(
        `${apiUrl}/notes/${noteId}/${path}`,
        { headers: cookie(viewerSession) },
      );
      expect(interaction.status()).toBe(200);
    }
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const follow = await request.put(`${apiUrl}/users/${authorId}/follow`, {
      headers: cookie(viewerSession),
    });
    expect(follow.status()).toBe(200);
  }

  const commentIds: string[] = [];
  for (let index = 0; index < 21; index += 1) {
    const comment = await request.post(`${apiUrl}/notes/${noteId}/comments`, {
      headers: cookie(viewerSession),
      data: { content: `通知分页评论 ${index + 1}` },
    });
    expect(comment.status()).toBe(201);
    commentIds.push(
      ((await comment.json()).data as { comment: { id: string } }).comment.id,
    );
  }

  for (const path of ['like', 'favorite']) {
    expect(
      (
        await request.delete(`${apiUrl}/notes/${noteId}/${path}`, {
          headers: cookie(viewerSession),
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.put(`${apiUrl}/notes/${noteId}/${path}`, {
          headers: cookie(viewerSession),
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await request.delete(`${apiUrl}/users/${authorId}/follow`, {
        headers: cookie(viewerSession),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.put(`${apiUrl}/users/${authorId}/follow`, {
        headers: cookie(viewerSession),
      })
    ).status(),
  ).toBe(200);

  const firstPageResponse = await request.get(
    `${apiUrl}/notifications?tab=all&limit=20`,
    { headers: cookie(authorSession) },
  );
  expect(firstPageResponse.status()).toBe(200);
  const firstPage = (await firstPageResponse.json()).data as {
    items: Array<{
      id: string;
      type: string;
      actor: Record<string, unknown>;
      comment: { preview: string | null; deleted: boolean } | null;
    }>;
    nextCursor: string | null;
  };
  expect(firstPage.items).toHaveLength(20);
  expect(firstPage.nextCursor).toEqual(expect.any(String));
  expect(firstPage.items[0]?.actor).not.toHaveProperty('email');

  const secondPageResponse = await request.get(
    `${apiUrl}/notifications?tab=all&limit=20&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    { headers: cookie(authorSession) },
  );
  expect(secondPageResponse.status()).toBe(200);
  const secondPage = (await secondPageResponse.json()).data as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(secondPage.items).toHaveLength(7);
  expect(
    new Set([
      ...firstPage.items.map((notification) => notification.id),
      ...secondPage.items.map((notification) => notification.id),
    ]).size,
  ).toBe(27);

  const commentsPage = await request.get(
    `${apiUrl}/notifications?tab=comments&limit=20`,
    { headers: cookie(authorSession) },
  );
  expect((await commentsPage.json()).data.items).toHaveLength(20);
  const reactionsPage = await request.get(
    `${apiUrl}/notifications?tab=reactions&limit=20`,
    { headers: cookie(authorSession) },
  );
  expect((await reactionsPage.json()).data.items).toHaveLength(4);
  const followsPage = await request.get(
    `${apiUrl}/notifications?tab=follows&limit=20`,
    { headers: cookie(authorSession) },
  );
  expect((await followsPage.json()).data.items).toHaveLength(2);

  const crossTabCursor = await request.get(
    `${apiUrl}/notifications?tab=follows&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
    { headers: cookie(authorSession) },
  );
  expect(crossTabCursor.status()).toBe(400);
  const crossUserRead = await request.put(
    `${apiUrl}/notifications/${firstPage.items[0]!.id}/read`,
    { headers: cookie(viewerSession) },
  );
  expect(crossUserRead.status()).toBe(404);

  const deleteComment = await request.delete(
    `${apiUrl}/notes/${noteId}/comments/${commentIds.at(-1)!}`,
    { headers: cookie(authorSession) },
  );
  expect(deleteComment.status()).toBe(200);

  await addSession(context, authorSession);
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/notifications?tab=comments');
  await expect(page.getByRole('heading', { name: '通知' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '评论' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('相关评论已删除')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /通知，27 条未读/ }),
  ).toBeVisible();
  const topbarBounds = await page.locator('.topbar').boundingBox();
  expect(topbarBounds).not.toBeNull();
  for (const label of ['创作中心', '业务合作']) {
    const actionBounds = await page
      .getByRole('button', { name: label })
      .boundingBox();
    expect(actionBounds).not.toBeNull();
    expect(actionBounds!.y).toBeGreaterThanOrEqual(topbarBounds!.y);
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(
      topbarBounds!.y + topbarBounds!.height,
    );
  }
  const longListLayout = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.notification-panel');
    return {
      horizontalOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      rootScrollable:
        document.documentElement.scrollHeight >
        document.documentElement.clientHeight,
      panelOverflowY: panel ? getComputedStyle(panel).overflowY : null,
    };
  });
  expect(longListLayout).toEqual({
    horizontalOverflow: false,
    rootScrollable: true,
    panelOverflowY: 'visible',
  });

  const notificationRow = page
    .getByRole('button', {
      name: /未读，通知蓝友评论了你的笔记/,
    })
    .first();
  await notificationRow.focus();
  await expect(notificationRow).toBeFocused();
  await notificationRow.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/explore/${noteId}$`));

  await page.goto('/notifications');
  await page.getByRole('button', { name: '一键已读' }).click();
  await expect(page.getByRole('status')).toContainText('全部通知已标记为已读');
  await expect(page.getByRole('link', { name: '通知' })).toBeVisible();
  const unread = await request.get(`${apiUrl}/notifications/unread-count`, {
    headers: cookie(authorSession),
  });
  expect((await unread.json()).data.unreadCount).toBe(0);

  await addSession(context, viewerSession);
  await page.goto('/notifications');
  await expect(page.getByText('暂时没有通知')).toBeVisible();
  await expect(page.getByTestId('notification-skeleton')).toHaveCount(0);
  const emptyLayout = await page.evaluate(() => ({
    horizontalOverflow:
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
    rootHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }));
  expect(emptyLayout.horizontalOverflow).toBe(false);
  expect(emptyLayout.rootHeight).toBeLessThanOrEqual(
    emptyLayout.viewportHeight,
  );
});

test('restores the notification destination after email login', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The login-intent browser flow runs once in Chromium.',
  );

  await page.goto('/');
  await page.getByRole('button', { name: '通知，登录后查看' }).click();
  const dialog = page.getByRole('dialog', { name: '邮箱登录' });
  await dialog
    .getByRole('textbox', { name: '邮箱' })
    .fill('notification-author@example.com');
  await dialog.getByLabel('同意用户协议与隐私政策').check();
  await dialog.getByRole('button', { name: '获取验证码' }).click();
  await dialog.getByRole('textbox', { name: '验证码' }).fill('246810');
  await dialog.getByRole('button', { name: '登录/注册' }).click();

  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: '通知' })).toBeVisible();
});

test('keeps notification tabs, keyboard navigation, login recovery and scrolling reliable across Firefox and WebKit', async ({
  context,
  page,
  request,
}, testInfo) => {
  const browserFamily = testInfo.project.name.startsWith('firefox-')
    ? 'firefox'
    : testInfo.project.name.startsWith('webkit-')
      ? 'webkit'
      : null;
  const identity = browserFamily ? crossBrowserIdentities[browserFamily] : null;
  test.skip(
    !identity || !testInfo.project.name.endsWith('-1440'),
    'Notification browser-difference coverage runs once in Firefox and WebKit.',
  );
  if (!identity) return;

  const title = `跨浏览器通知-${browserFamily}-${Date.now()}`;
  const noteId = await publish(request, identity.authorSession, title);
  const comment = await request.post(`${apiUrl}/notes/${noteId}/comments`, {
    headers: cookie(identity.viewerSession),
    data: { content: `${browserFamily} 通知跳转` },
  });
  expect(comment.status()).toBe(201);

  await addSession(context, identity.authorSession);
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/notifications?tab=comments');

  const commentsTab = page.getByRole('tab', { name: '评论' });
  await expect(commentsTab).toHaveAttribute('aria-selected', 'true');
  await commentsTab.focus();
  await commentsTab.press('ArrowRight');
  const reactionsTab = page.getByRole('tab', { name: '赞和收藏' });
  await expect(reactionsTab).toBeFocused();
  await reactionsTab.press('Enter');
  await expect(page).toHaveURL(/\/notifications\?tab=reactions$/);
  await page.goBack();
  await expect(commentsTab).toHaveAttribute('aria-selected', 'true');
  const notificationRow = page.getByRole('button', {
    name: new RegExp(`未读，${identity.viewerNickname}评论了你的笔记`),
  });
  await expect(notificationRow).toBeVisible();

  const shortListLayout = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.notification-panel');
    return {
      horizontalOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      rootScrollable:
        document.documentElement.scrollHeight >
        document.documentElement.clientHeight,
      panelOverflowY: panel ? getComputedStyle(panel).overflowY : null,
    };
  });
  expect(shortListLayout).toEqual({
    horizontalOverflow: false,
    rootScrollable: false,
    panelOverflowY: 'visible',
  });

  await notificationRow.focus();
  await expect(notificationRow).toBeFocused();
  await notificationRow.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/explore/${noteId}$`));

  await context.clearCookies();
  await page.goto('/');
  await page.getByRole('button', { name: '通知，登录后查看' }).click();
  const dialog = page.getByRole('dialog', { name: '邮箱登录' });
  await dialog
    .getByRole('textbox', { name: '邮箱' })
    .fill(identity.authorEmail);
  await dialog.getByLabel('同意用户协议与隐私政策').check();
  await dialog.getByRole('button', { name: '获取验证码' }).click();
  await dialog.getByRole('textbox', { name: '验证码' }).fill('246810');
  await dialog.getByRole('button', { name: '登录/注册' }).click();

  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: '通知' })).toBeVisible();
});

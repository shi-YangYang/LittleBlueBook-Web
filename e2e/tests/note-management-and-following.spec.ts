import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

import { tinyBlueCover, tinyH264Mp4 } from '../fixtures/tiny-h264-video';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const viewerSession = 'spec014-viewer-session';
const profileSession = 'spec014-following-owner-session';
const authors = {
  chromium: {
    id: '00000000-0000-4000-8000-000000000126',
    session: 'spec014-chromium-author-session',
  },
  firefox: {
    id: '00000000-0000-4000-8000-000000000127',
    session: 'spec014-firefox-author-session',
  },
  webkit: {
    id: '00000000-0000-4000-8000-000000000128',
    session: 'spec014-webkit-author-session',
  },
} as const;
const cleanupNotes = new Map<string, string>();
const cleanupFollows = new Map<string, string>();
const blueLandscape = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);

function cookie(session: string) {
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

async function publishImage(
  request: APIRequestContext,
  title: string,
  authorSession: string,
): Promise<string> {
  const response = await request.post(`${apiUrl}/notes`, {
    headers: cookie(authorSession),
    multipart: {
      title,
      content: '笔记管理浏览器验收正文',
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'blue-landscape.png',
        mimeType: 'image/png',
        buffer: blueLandscape,
      },
    },
  });
  expect(response.status()).toBe(201);
  const noteId = (await response.json()).data.id as string;
  cleanupNotes.set(noteId, authorSession);
  return noteId;
}

async function publishVideo(
  request: APIRequestContext,
  title: string,
  authorSession: string,
): Promise<string> {
  const response = await request.post(`${apiUrl}/notes/videos`, {
    headers: cookie(authorSession),
    multipart: {
      title,
      content: '视频笔记编辑边界验收正文',
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      video: {
        name: 'tiny-h264.mp4',
        mimeType: 'video/mp4',
        buffer: tinyH264Mp4,
      },
      cover: {
        name: 'tiny-blue-cover.png',
        mimeType: 'image/png',
        buffer: tinyBlueCover,
      },
    },
  });
  expect(response.status()).toBe(201);
  const noteId = (await response.json()).data.id as string;
  cleanupNotes.set(noteId, authorSession);
  return noteId;
}

function browserAuthor(projectName: string) {
  if (projectName.startsWith('firefox-')) return authors.firefox;
  if (projectName.startsWith('webkit-')) return authors.webkit;
  return authors.chromium;
}

async function cleanupScenarioState(request: APIRequestContext) {
  for (const [noteId, session] of cleanupNotes) {
    const editable = await request.get(`${apiUrl}/notes/${noteId}/edit`, {
      headers: cookie(session),
    });
    if (editable.status() === 200) {
      const contentVersion = (await editable.json()).data.contentVersion;
      await request.delete(`${apiUrl}/notes/${noteId}`, {
        headers: cookie(session),
        data: { expectedContentVersion: contentVersion },
      });
    }
  }
  cleanupNotes.clear();

  for (const [cleanupKey, session] of cleanupFollows) {
    const followedId = cleanupKey.slice(cleanupKey.indexOf(':') + 1);
    await request.delete(`${apiUrl}/users/${followedId}/follow`, {
      headers: cookie(session),
    });
  }
  cleanupFollows.clear();
}

test.afterEach(async ({ request }) => {
  await cleanupScenarioState(request);
});

test('keeps author image edits optimistic and permanently removes the note', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The database protocol is browser-independent and runs once.',
  );
  const author = authors.chromium;
  const title = `图文管理-${Date.now()}`;
  const noteId = await publishImage(request, title, author.session);

  const anonymousEdit = await request.get(`${apiUrl}/notes/${noteId}/edit`);
  expect(anonymousEdit.status()).toBe(401);
  const otherEdit = await request.get(`${apiUrl}/notes/${noteId}/edit`, {
    headers: cookie(viewerSession),
  });
  expect(otherEdit.status()).toBe(404);

  const editResponse = await request.get(`${apiUrl}/notes/${noteId}/edit`, {
    headers: cookie(author.session),
  });
  expect(editResponse.status()).toBe(200);
  const editable = (await editResponse.json()).data as {
    contentVersion: number;
    images: Array<{ id: string; url: string }>;
  };
  expect(editable.contentVersion).toBe(1);
  expect(editable.images).toHaveLength(1);

  const originalDetailResponse = await request.get(`${apiUrl}/notes/${noteId}`);
  const originalDetail = (await originalDetailResponse.json()).data as {
    createdAt: string;
    images: Array<{ url: string }>;
  };
  await request.put(`${apiUrl}/notes/${noteId}/like`, {
    headers: cookie(viewerSession),
  });
  await request.put(`${apiUrl}/notes/${noteId}/favorite`, {
    headers: cookie(viewerSession),
  });
  await request.post(`${apiUrl}/notes/${noteId}/comments`, {
    headers: cookie(viewerSession),
    data: { content: '删除时一并清理的评论' },
  });
  await request.put(`${apiUrl}/users/${author.id}/follow`, {
    headers: cookie(viewerSession),
  });
  cleanupFollows.set(`${viewerSession}:${author.id}`, viewerSession);

  const firstEdit = await request.patch(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
    multipart: {
      title: `${title}-已编辑`,
      content: '保留原图并追加新图',
      channelCode: 'other',
      contentType: 'IMAGE',
      expectedContentVersion: String(editable.contentVersion),
      imageOrder: JSON.stringify([
        { kind: 'new', index: 0 },
        { kind: 'existing', id: editable.images[0]!.id },
      ]),
      images: {
        name: 'new-blue-cover.png',
        mimeType: 'image/png',
        buffer: tinyBlueCover,
      },
    },
  });
  expect(firstEdit.status()).toBe(200);
  expect((await firstEdit.json()).data).toMatchObject({
    id: noteId,
    contentVersion: 2,
  });

  const afterFirstEdit = await request.get(`${apiUrl}/notes/${noteId}/edit`, {
    headers: cookie(author.session),
  });
  const latest = (await afterFirstEdit.json()).data as {
    contentVersion: number;
    images: Array<{ id: string }>;
  };
  expect(latest.images).toHaveLength(2);
  const imageOrder = JSON.stringify(
    latest.images.map((image) => ({ kind: 'existing', id: image.id })),
  );
  const concurrentBodies = ['并发编辑 A', '并发编辑 B'].map((content) => ({
    headers: cookie(author.session),
    multipart: {
      title: `${title}-并发`,
      content,
      channelCode: 'digital',
      contentType: 'IMAGE',
      expectedContentVersion: String(latest.contentVersion),
      imageOrder,
    },
  }));
  const concurrent = await Promise.all(
    concurrentBodies.map((options) =>
      request.patch(`${apiUrl}/notes/${noteId}`, options),
    ),
  );
  expect(concurrent.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const conflict = concurrent.find((response) => response.status() === 409)!;
  expect(await conflict.json()).toMatchObject({ code: 'NOTE_EDIT_CONFLICT' });

  const detailAfterEdit = await request.get(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
  });
  const updated = (await detailAfterEdit.json()).data as {
    createdAt: string;
    editedAt: string | null;
    images: Array<{ url: string }>;
    interactions: { likes: number; favorites: number; comments: number };
    management: { contentVersion: number };
  };
  expect(updated.createdAt).toBe(originalDetail.createdAt);
  expect(updated.editedAt).not.toBeNull();
  expect(updated.management.contentVersion).toBe(3);
  expect(updated.interactions).toMatchObject({
    likes: 1,
    favorites: 1,
    comments: 1,
  });

  const publicPage = await request.get(
    `${apiUrl}/notes/recommendations?limit=20`,
  );
  const publicCard = (await publicPage.json()).data.items.find(
    (item: { id: string }) => item.id === noteId,
  );
  expect(publicCard.management).toBeUndefined();
  const minePage = await request.get(`${apiUrl}/notes/mine?limit=20`, {
    headers: cookie(author.session),
  });
  const mineCard = (await minePage.json()).data.items.find(
    (item: { id: string }) => item.id === noteId,
  );
  expect(mineCard.management).toEqual({ contentVersion: 3 });

  const staleDelete = await request.delete(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
    data: { expectedContentVersion: 2 },
  });
  expect(staleDelete.status()).toBe(409);
  const deleted = await request.delete(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
    data: { expectedContentVersion: 3 },
  });
  expect(deleted.status()).toBe(200);
  expect((await deleted.json()).data).toEqual({ id: noteId, deleted: true });

  expect((await request.get(`${apiUrl}/notes/${noteId}`)).status()).toBe(404);
  expect(
    (
      await request.get(`${apiUrl}/notes/${noteId}/edit`, {
        headers: cookie(author.session),
      })
    ).status(),
  ).toBe(404);
  cleanupNotes.delete(noteId);
  expect(
    (
      await request.put(`${apiUrl}/notes/${noteId}/favorite`, {
        headers: cookie(viewerSession),
      })
    ).status(),
  ).toBe(404);
  for (const image of updated.images) {
    expect((await request.get(image.url)).status()).toBe(404);
  }
  const stillFollowing = await request.get(`${apiUrl}/profile/me/following`, {
    headers: cookie(viewerSession),
  });
  expect(
    (await stillFollowing.json()).data.items.some(
      (item: { id: string }) => item.id === author.id,
    ),
  ).toBe(true);
});

test('invalidates an open delete confirmation after a concurrent edit', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The stale confirmation protocol is browser-independent and runs once.',
  );
  const author = authors.chromium;
  const noteId = await publishImage(
    request,
    `删除快照-${Date.now()}`,
    author.session,
  );
  await addSession(context, author.session);
  await page.goto(`/explore/${noteId}`);
  await page.getByRole('button', { name: '更多笔记操作' }).click();
  await page.getByRole('menuitem', { name: '删除笔记' }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: '永久删除笔记',
  });
  await expect(confirmation).toBeVisible();

  const editableResponse = await request.get(
    `${apiUrl}/notes/${noteId}/edit`,
    { headers: cookie(author.session) },
  );
  const editable = (await editableResponse.json()).data as {
    contentVersion: number;
    images: Array<{ id: string }>;
  };
  const editResponse = await request.patch(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
    multipart: {
      title: '并发更新后的标题',
      content: '打开删除确认后，另一个页面完成了编辑',
      channelCode: 'digital',
      contentType: 'IMAGE',
      expectedContentVersion: String(editable.contentVersion),
      imageOrder: JSON.stringify(
        editable.images.map((image) => ({
          kind: 'existing',
          id: image.id,
        })),
      ),
    },
  });
  expect(editResponse.status()).toBe(200);

  await confirmation.getByRole('button', { name: '确认删除' }).click();
  await expect(confirmation).toBeHidden();
  await expect(
    page.getByText('笔记已被更新，请重新打开删除确认'),
  ).toBeVisible();
  expect((await request.get(`${apiUrl}/notes/${noteId}`)).status()).toBe(200);

  await page.getByRole('button', { name: '更多笔记操作' }).click();
  await page.getByRole('menuitem', { name: '删除笔记' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect((await request.get(`${apiUrl}/notes/${noteId}`)).status()).toBe(404);
  cleanupNotes.delete(noteId);
});

test('turns a stale detail into the deleted state after an interaction', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The deleted-detail recovery protocol is browser-independent and runs once.',
  );
  const author = authors.chromium;
  const noteId = await publishImage(
    request,
    `旧详情-${Date.now()}`,
    author.session,
  );
  await addSession(context, viewerSession);
  await page.goto(`/explore/${noteId}`);
  await expect(page.getByLabel(/收藏，当前/)).toBeVisible();

  const editableResponse = await request.get(
    `${apiUrl}/notes/${noteId}/edit`,
    { headers: cookie(author.session) },
  );
  const contentVersion = (await editableResponse.json()).data.contentVersion;
  const deleted = await request.delete(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
    data: { expectedContentVersion: contentVersion },
  });
  expect(deleted.status()).toBe(200);
  cleanupNotes.delete(noteId);

  await page.getByLabel(/收藏，当前/).click();
  await expect(
    page.getByRole('heading', { name: '笔记不存在或已删除' }),
  ).toBeVisible();
  await expect(page.locator('.note-detail')).toHaveCount(0);
});

test('keeps management and following dialogs keyboard-safe across browsers', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Menu, confirmation, focus and scroll-lock differences run once per engine.',
  );
  const author = browserAuthor(testInfo.project.name);
  const noteId = await publishImage(
    request,
    `跨浏览器管理-${testInfo.project.name}-${Date.now()}`,
    author.session,
  );
  await addSession(context, author.session);
  await page.goto(`/explore/${noteId}`);
  const manageTrigger = page.getByRole('button', { name: '更多笔记操作' });
  await manageTrigger.click();
  await expect(page.getByRole('menuitem', { name: '编辑笔记' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(manageTrigger).toBeFocused();
  await manageTrigger.click();
  await page.getByRole('menuitem', { name: '删除笔记' }).click();
  const deleteDialog = page.getByRole('alertdialog', {
    name: '永久删除笔记',
  });
  await expect(deleteDialog).toBeVisible();
  await expect(
    deleteDialog.getByRole('button', { name: '确认删除' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(deleteDialog).toBeHidden();
  await expect(manageTrigger).toBeFocused();

  const targetIndex = testInfo.project.name.startsWith('firefox-')
    ? 202
    : testInfo.project.name.startsWith('webkit-')
      ? 203
      : 201;
  const targetId = `00000000-0000-4000-8000-${String(targetIndex).padStart(12, '0')}`;
  const follow = await request.put(`${apiUrl}/users/${targetId}/follow`, {
    headers: cookie(profileSession),
  });
  expect(follow.status()).toBe(200);
  cleanupFollows.set(`${profileSession}:${targetId}`, profileSession);
  await addSession(context, profileSession);
  await page.goto('/profile');
  const followingTrigger = page.getByRole('button', {
    name: /查看我的关注，共 1 人/,
  });
  await followingTrigger.click();
  const followingDialog = page.getByRole('dialog', { name: '我的关注' });
  await expect(followingDialog).toBeVisible();
  expect(
    await page.evaluate(() => ({
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
    })),
  ).toEqual({ html: 'hidden', body: 'hidden' });
  const unfollowTrigger = followingDialog.getByRole('button', {
    name: '已关注',
  });
  await unfollowTrigger.click();
  const unfollowDialog = page.getByRole('alertdialog', {
    name: '取消关注',
  });
  await expect(unfollowDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(unfollowDialog).toBeHidden();
  await expect(unfollowTrigger).toBeFocused();
  await followingDialog
    .getByRole('button', { name: '关闭关注列表' })
    .click();
  await expect(followingDialog).toBeHidden();
  await expect(followingTrigger).toBeFocused();
  expect(
    await page.evaluate(() => ({
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
    })),
  ).toEqual({ html: '', body: '' });
});

test('keeps the original video immutable while replacing only its cover', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Video file-input and navigation differences run once per browser engine.',
  );
  const author = browserAuthor(testInfo.project.name);
  const title = `视频管理-${testInfo.project.name}-${Date.now()}`;
  const noteId = await publishVideo(request, title, author.session);
  const beforeResponse = await request.get(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
  });
  const before = (await beforeResponse.json()).data as {
    video: { url: string; posterUrl: string };
    management: { contentVersion: number };
  };

  const tampered = await request.patch(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
    multipart: {
      title,
      content: '不允许改变类型',
      channelCode: 'digital',
      contentType: 'IMAGE',
      expectedContentVersion: String(before.management.contentVersion),
      imageOrder: '[]',
    },
  });
  expect(tampered.status()).toBe(400);
  expect(await tampered.json()).toMatchObject({ code: 'NOTE_TYPE_IMMUTABLE' });

  const replaced = await request.patch(`${apiUrl}/notes/${noteId}`, {
    headers: cookie(author.session),
    multipart: {
      title: `${title}-已编辑`,
      content: '原视频保持不变，只替换封面',
      channelCode: 'digital',
      contentType: 'VIDEO',
      expectedContentVersion: String(before.management.contentVersion),
      cover: {
        name: 'replacement-cover.png',
        mimeType: 'image/png',
        buffer: blueLandscape,
      },
    },
  });
  expect(replaced.status()).toBe(200);
  const afterResponse = await request.get(`${apiUrl}/notes/${noteId}`);
  const after = (await afterResponse.json()).data as {
    video: { url: string; posterUrl: string };
  };
  expect(after.video.url).toBe(before.video.url);
  expect(after.video.posterUrl).not.toBe(before.video.posterUrl);

  await addSession(context, author.session);
  await page.goto(`/publish?edit=${noteId}`);
  await expect(
    page.getByRole('heading', { name: '编辑视频笔记' }),
  ).toBeVisible();
  await expect(page.getByLabel('选择笔记视频')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '替换视频' })).toHaveCount(0);
  await expect(page.getByText(/原视频不可替换/)).toBeVisible();
  await page.getByLabel('选择视频封面').setInputFiles({
    name: 'ui-replacement-cover.png',
    mimeType: 'image/png',
    buffer: tinyBlueCover,
  });
  await page.getByLabel('标题').fill(`${title}-UI`);
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/${noteId}$`));
  await expect(page.getByText('笔记修改已保存')).toBeVisible();
});

test('paginates only my following and confirms an authoritative unfollow in the modal', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1280',
    'The complete private following modal flow runs once in Chromium.',
  );
  const targets = Array.from({ length: 21 }, (_, index) => index + 201)
    .map(
      (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`,
    );
  for (const targetId of targets) {
    const response = await request.put(`${apiUrl}/users/${targetId}/follow`, {
      headers: cookie(profileSession),
    });
    expect(response.status()).toBe(200);
    cleanupFollows.set(`${profileSession}:${targetId}`, profileSession);
  }

  expect((await request.get(`${apiUrl}/profile/me/following`)).status()).toBe(
    401,
  );
  const first = await request.get(`${apiUrl}/profile/me/following`, {
    headers: cookie(profileSession),
  });
  expect(first.status()).toBe(200);
  const firstPage = (await first.json()).data as {
    items: Array<Record<string, unknown>>;
    nextCursor: string;
  };
  expect(firstPage.items).toHaveLength(20);
  expect(firstPage.nextCursor).toEqual(expect.any(String));
  expect(JSON.stringify(firstPage)).not.toContain('@example.com');
  const second = await request.get(
    `${apiUrl}/profile/me/following?cursor=${encodeURIComponent(firstPage.nextCursor)}`,
    { headers: cookie(profileSession) },
  );
  expect(second.status()).toBe(200);
  expect((await second.json()).data.items).toHaveLength(1);
  const invalid = await request.get(
    `${apiUrl}/profile/me/following?cursor=${encodeURIComponent(`${firstPage.nextCursor}tampered`)}`,
    { headers: cookie(profileSession) },
  );
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toMatchObject({
    code: 'FOLLOWING_CURSOR_INVALID',
  });

  await addSession(context, profileSession);
  await page.goto('/profile');
  const trigger = page.getByRole('button', { name: /查看我的关注，共 21 人/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '我的关注' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.following-row')).toHaveCount(20);
  await dialog
    .getByRole('button', { name: '加载更多' })
    .scrollIntoViewIfNeeded();
  await expect(dialog.locator('.following-row')).toHaveCount(21);
  const rootOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight,
  );
  expect(rootOverflow).toBe(false);

  const firstUnfollow = dialog.getByRole('button', { name: '已关注' }).first();
  await firstUnfollow.click();
  const confirmation = page.getByRole('alertdialog', { name: '取消关注' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(firstUnfollow).toBeFocused();
  await firstUnfollow.click();
  await confirmation.getByRole('button', { name: '确认取消关注' }).click();
  await expect(dialog.locator('.following-row')).toHaveCount(20);
  const updatedTrigger = page.getByRole('button', {
    name: /查看我的关注，共 20 人/,
  });
  await expect(updatedTrigger).toBeVisible();
  await dialog.getByRole('button', { name: '关闭关注列表' }).click();
  await expect(updatedTrigger).toBeFocused();
});

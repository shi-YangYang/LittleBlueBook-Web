import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const reporter = {
  id: '00000000-0000-4000-8000-000000000131',
  session: 'spec015-reporter-session',
};
const target = {
  id: '00000000-0000-4000-8000-000000000132',
  session: 'spec015-target-session',
};
const admin = {
  id: '00000000-0000-4000-8000-000000000133',
  session: 'spec015-admin-session',
};
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
    headers: cookie(target.session),
    multipart: {
      title,
      content: `内容治理自动化正文：${title}`,
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'governance-note.png',
        mimeType: 'image/png',
        buffer: blueImage,
      },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()).data as { id: string }).id;
}

async function report(
  request: APIRequestContext,
  targetType: 'NOTE' | 'COMMENT' | 'USER',
  targetId: string,
) {
  return request.post(`${apiUrl}/safety/reports`, {
    headers: cookie(reporter.session),
    data: {
      targetType,
      targetId,
      reason: 'HARASSMENT',
      details: 'SPEC-015 自动化举报说明',
    },
  });
}

test('enforces the complete governance, blocking and moderation safety boundary', async ({
  request,
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The governance integration contract runs once in the Chromium main-flow project.',
  );

  const moderatedNoteId = await publish(request, `治理处置-${Date.now()}`);
  const deletedNoteId = await publish(request, `治理删除-${Date.now()}`);
  const moderatedDetail = await request.get(
    `${apiUrl}/notes/${moderatedNoteId}`,
  );
  const moderatedMediaUrl = (await moderatedDetail.json()).data.images[0]
    .url as string;
  for (const method of ['get', 'head'] as const) {
    expect((await request[method](moderatedMediaUrl)).status()).toBe(200);
  }

  const anonymousReport = await request.post(`${apiUrl}/safety/reports`, {
    data: {
      targetType: 'NOTE',
      targetId: moderatedNoteId,
      reason: 'HARASSMENT',
    },
  });
  expect(anonymousReport.status()).toBe(401);

  const [firstReport, duplicateReport] = await Promise.all([
    report(request, 'NOTE', moderatedNoteId),
    report(request, 'NOTE', moderatedNoteId),
  ]);
  expect(firstReport.status()).toBe(200);
  expect(duplicateReport.status()).toBe(200);
  expect((await duplicateReport.json()).data.id).toBe(
    (await firstReport.json()).data.id,
  );

  const selfReport = await request.post(`${apiUrl}/safety/reports`, {
    headers: cookie(target.session),
    data: {
      targetType: 'NOTE',
      targetId: moderatedNoteId,
      reason: 'SPAM',
    },
  });
  expect(selfReport.status()).toBe(404);

  const raceNoteId = await publish(request, `举报删除竞态-${Date.now()}`);
  const [raceReport, raceDelete] = await Promise.all([
    report(request, 'NOTE', raceNoteId),
    request.delete(`${apiUrl}/notes/${raceNoteId}`, {
      headers: cookie(target.session),
      data: { expectedContentVersion: 1 },
    }),
  ]);
  expect(raceDelete.status()).toBe(200);
  expect([200, 404]).toContain(raceReport.status());
  const reportsAfterNoteRace = await request.get(`${apiUrl}/safety/reports`, {
    headers: cookie(reporter.session),
  });
  expect(
    (await reportsAfterNoteRace.json()).data.items.every(
      (item: { targetId: string; status: string }) =>
        item.targetId !== raceNoteId || item.status === 'TARGET_UNAVAILABLE',
    ),
  ).toBe(true);

  const raceCommentResponse = await request.post(
    `${apiUrl}/notes/${moderatedNoteId}/comments`,
    {
      headers: cookie(target.session),
      data: { content: '举报删除竞态评论' },
    },
  );
  const raceCommentId = (await raceCommentResponse.json()).data.comment
    .id as string;
  const [raceCommentReport, raceCommentDelete] = await Promise.all([
    report(request, 'COMMENT', raceCommentId),
    request.delete(
      `${apiUrl}/notes/${moderatedNoteId}/comments/${raceCommentId}`,
      { headers: cookie(target.session) },
    ),
  ]);
  expect(raceCommentDelete.status()).toBe(200);
  expect([200, 404]).toContain(raceCommentReport.status());
  const reportsAfterCommentRace = await request.get(
    `${apiUrl}/safety/reports`,
    { headers: cookie(reporter.session) },
  );
  expect(
    (await reportsAfterCommentRace.json()).data.items.every(
      (item: { targetId: string; status: string }) =>
        item.targetId !== raceCommentId || item.status === 'TARGET_UNAVAILABLE',
    ),
  ).toBe(true);

  expect(
    (
      await request.put(`${apiUrl}/users/${target.id}/follow`, {
        headers: cookie(reporter.session),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.put(`${apiUrl}/users/${reporter.id}/follow`, {
        headers: cookie(target.session),
      })
    ).status(),
  ).toBe(200);
  const firstMessage = await request.post(
    `${apiUrl}/messages/users/${target.id}`,
    {
      headers: cookie(reporter.session),
      data: { content: '拉黑前的历史私信', clientRequestId: randomUUID() },
    },
  );
  expect(firstMessage.status()).toBe(201);
  const conversationId = (await firstMessage.json()).data
    .conversationId as string;

  const rootResponse = await request.post(
    `${apiUrl}/notes/${moderatedNoteId}/comments`,
    {
      headers: cookie(reporter.session),
      data: { content: '删除后保留回复树的评论' },
    },
  );
  expect(rootResponse.status()).toBe(201);
  const rootId = (await rootResponse.json()).data.comment.id as string;
  const replyResponse = await request.post(
    `${apiUrl}/notes/${moderatedNoteId}/comments/${rootId}/replies`,
    {
      headers: cookie(target.session),
      data: { content: '保留的回复' },
    },
  );
  expect(replyResponse.status()).toBe(201);
  const targetReplyId = (await replyResponse.json()).data.comment.id as string;
  expect((await report(request, 'COMMENT', targetReplyId)).status()).toBe(200);
  expect(
    (
      await request.delete(
        `${apiUrl}/notes/${moderatedNoteId}/comments/${rootId}`,
        { headers: cookie(target.session) },
      )
    ).status(),
  ).toBe(403);
  const deleteComment = await request.delete(
    `${apiUrl}/notes/${moderatedNoteId}/comments/${rootId}`,
    { headers: cookie(reporter.session) },
  );
  expect(deleteComment.status()).toBe(200);
  expect((await deleteComment.json()).data).toMatchObject({
    deleted: true,
    placeholder: true,
  });
  const comments = await request.get(
    `${apiUrl}/notes/${moderatedNoteId}/comments`,
    { headers: cookie(reporter.session) },
  );
  const tombstone = (await comments.json()).data.items.find(
    (item: { id: string }) => item.id === rootId,
  );
  expect(tombstone).toMatchObject({
    content: null,
    deleted: true,
    author: null,
    canDelete: false,
    canReply: false,
    canLike: false,
    canReport: false,
  });
  expect(tombstone.replies).toHaveLength(1);

  const disposableComment = await request.post(
    `${apiUrl}/notes/${moderatedNoteId}/comments`,
    {
      headers: cookie(reporter.session),
      data: { content: '被举报后由本人删除的评论' },
    },
  );
  expect(disposableComment.status()).toBe(201);
  const disposableCommentId = (await disposableComment.json()).data.comment
    .id as string;
  const targetCommentReport = await request.post(`${apiUrl}/safety/reports`, {
    headers: cookie(target.session),
    data: {
      targetType: 'COMMENT',
      targetId: disposableCommentId,
      reason: 'SPAM',
    },
  });
  expect(targetCommentReport.status()).toBe(200);
  expect(
    (
      await request.delete(
        `${apiUrl}/notes/${moderatedNoteId}/comments/${disposableCommentId}`,
        { headers: cookie(reporter.session) },
      )
    ).status(),
  ).toBe(200);
  const targetReports = await request.get(`${apiUrl}/safety/reports`, {
    headers: cookie(target.session),
  });
  expect((await targetReports.json()).data.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        targetId: disposableCommentId,
        status: 'TARGET_UNAVAILABLE',
      }),
    ]),
  );

  const blockResponse = await request.post(
    `${apiUrl}/safety/users/${target.id}/block`,
    { headers: cookie(reporter.session) },
  );
  expect(blockResponse.status()).toBe(200);
  expect(
    (
      await request.get(`${apiUrl}/users/${target.id}/profile`, {
        headers: cookie(reporter.session),
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(`${apiUrl}/users/${reporter.id}/profile`, {
        headers: cookie(target.session),
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(`${apiUrl}/notes/${moderatedNoteId}`, {
        headers: cookie(reporter.session),
      })
    ).status(),
  ).toBe(404);
  for (const method of ['get', 'head'] as const) {
    expect(
      (
        await request[method](moderatedMediaUrl, {
          headers: cookie(reporter.session),
        })
      ).status(),
    ).toBe(404);
    expect((await request[method](moderatedMediaUrl)).status()).toBe(200);
  }
  expect(
    (
      await request.put(`${apiUrl}/users/${target.id}/follow`, {
        headers: cookie(reporter.session),
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`${apiUrl}/messages/users/${target.id}`, {
        headers: cookie(reporter.session),
        data: { content: '拉黑期间禁止发送', clientRequestId: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  const history = await request.get(
    `${apiUrl}/messages/conversations/${conversationId}`,
    { headers: cookie(reporter.session) },
  );
  expect(history.status()).toBe(200);
  expect((await history.json()).data.canSend).toBe(false);
  const notificationPage = await request.get(`${apiUrl}/notifications`, {
    headers: cookie(reporter.session),
  });
  expect(notificationPage.status()).toBe(200);
  expect(
    (await notificationPage.json()).data.items.every(
      (item: { actor: { id: string | null } }) => item.actor.id !== target.id,
    ),
  ).toBe(true);
  const blockedPage = await request.get(`${apiUrl}/safety/blocked-users`, {
    headers: cookie(reporter.session),
  });
  expect((await blockedPage.json()).data.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: target.id })]),
  );

  expect(
    (
      await request.delete(`${apiUrl}/safety/users/${target.id}/block`, {
        headers: cookie(reporter.session),
      })
    ).status(),
  ).toBe(200);
  for (const method of ['get', 'head'] as const) {
    expect(
      (
        await request[method](moderatedMediaUrl, {
          headers: cookie(reporter.session),
        })
      ).status(),
    ).toBe(200);
  }
  const unblockedProfile = await request.get(
    `${apiUrl}/users/${target.id}/profile`,
    { headers: cookie(reporter.session) },
  );
  expect((await unblockedProfile.json()).data.viewer).toMatchObject({
    following: false,
    canMessage: false,
  });
  expect(
    (
      await request.post(`${apiUrl}/messages/users/${target.id}`, {
        headers: cookie(reporter.session),
        data: { content: '解除后仍需互关', clientRequestId: randomUUID() },
      })
    ).status(),
  ).toBe(409);

  const nonAdmin = await request.get(`${apiUrl}/admin/moderation`, {
    headers: cookie(reporter.session),
  });
  expect(nonAdmin.status()).toBe(404);
  const adminReports = await request.get(
    `${apiUrl}/admin/moderation?status=PENDING&targetType=NOTE`,
    { headers: cookie(admin.session) },
  );
  expect(adminReports.status()).toBe(200);
  expect((await adminReports.json()).data.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ targetId: moderatedNoteId, status: 'PENDING' }),
    ]),
  );

  const hideNote = await request.post(`${apiUrl}/admin/moderation/actions`, {
    headers: cookie(admin.session),
    data: {
      action: 'HIDE_NOTE',
      targetType: 'NOTE',
      targetId: moderatedNoteId,
      reason: '自动化验证隐藏笔记',
    },
  });
  expect(hideNote.status()).toBe(200);
  expect((await hideNote.json()).data).toMatchObject({
    changed: true,
    state: 'HIDDEN',
  });
  const idempotentHide = await request.post(
    `${apiUrl}/admin/moderation/actions`,
    {
      headers: cookie(admin.session),
      data: {
        action: 'HIDE_NOTE',
        targetType: 'NOTE',
        targetId: moderatedNoteId,
        reason: '重复隐藏不新增副作用',
      },
    },
  );
  expect((await idempotentHide.json()).data.changed).toBe(false);
  expect(
    (await request.get(`${apiUrl}/notes/${moderatedNoteId}`)).status(),
  ).toBe(404);
  for (const method of ['get', 'head'] as const) {
    expect((await request[method](moderatedMediaUrl)).status()).toBe(404);
    expect(
      (
        await request[method](moderatedMediaUrl, {
          headers: cookie(target.session),
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request[method](moderatedMediaUrl, {
          headers: cookie(admin.session),
        })
      ).status(),
    ).toBe(200);
  }
  const authorPlaceholder = await request.get(
    `${apiUrl}/notes/${moderatedNoteId}`,
    {
      headers: cookie(target.session),
    },
  );
  expect((await authorPlaceholder.json()).data).toMatchObject({
    title: '内容已被管理员隐藏',
    content: '',
    images: [],
    video: null,
    moderationHidden: true,
  });
  expect(
    (
      await request.get(`${apiUrl}/notes/${moderatedNoteId}/edit`, {
        headers: cookie(target.session),
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.delete(`${apiUrl}/notes/${moderatedNoteId}`, {
        headers: cookie(target.session),
        data: { expectedContentVersion: 1 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`${apiUrl}/notes/${moderatedNoteId}/comments`, {
        headers: cookie(target.session),
        data: { content: '隐藏后不可互动' },
      })
    ).status(),
  ).toBe(404);
  const restoreNote = await request.post(`${apiUrl}/admin/moderation/actions`, {
    headers: cookie(admin.session),
    data: {
      action: 'RESTORE_NOTE',
      targetType: 'NOTE',
      targetId: moderatedNoteId,
      reason: '自动化验证恢复笔记',
    },
  });
  expect((await restoreNote.json()).data).toMatchObject({
    changed: true,
    state: 'VISIBLE',
  });
  expect(
    (await request.get(`${apiUrl}/notes/${moderatedNoteId}`)).status(),
  ).toBe(200);
  for (const method of ['get', 'head'] as const) {
    expect((await request[method](moderatedMediaUrl)).status()).toBe(200);
  }

  const hideComment = await request.post(`${apiUrl}/admin/moderation/actions`, {
    headers: cookie(admin.session),
    data: {
      action: 'HIDE_COMMENT',
      targetType: 'COMMENT',
      targetId: targetReplyId,
      reason: '自动化验证隐藏评论',
    },
  });
  expect((await hideComment.json()).data).toMatchObject({
    changed: true,
    state: 'HIDDEN',
  });
  const hiddenReplies = await request.get(
    `${apiUrl}/notes/${moderatedNoteId}/comments/${rootId}/replies`,
    { headers: cookie(target.session) },
  );
  expect((await hiddenReplies.json()).data.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: targetReplyId,
        content: null,
        moderationHidden: true,
        author: null,
      }),
    ]),
  );
  const restoreComment = await request.post(
    `${apiUrl}/admin/moderation/actions`,
    {
      headers: cookie(admin.session),
      data: {
        action: 'RESTORE_COMMENT',
        targetType: 'COMMENT',
        targetId: targetReplyId,
        reason: '自动化验证恢复评论',
      },
    },
  );
  expect((await restoreComment.json()).data).toMatchObject({
    changed: true,
    state: 'VISIBLE',
  });

  const cascadeRoot = await request.post(
    `${apiUrl}/notes/${deletedNoteId}/comments`,
    {
      headers: cookie(target.session),
      data: { content: '随笔记删除的一级评论' },
    },
  );
  const cascadeRootId = (await cascadeRoot.json()).data.comment.id as string;
  const cascadeReply = await request.post(
    `${apiUrl}/notes/${deletedNoteId}/comments/${cascadeRootId}/replies`,
    {
      headers: cookie(target.session),
      data: { content: '随笔记删除的回复' },
    },
  );
  const cascadeReplyId = (await cascadeReply.json()).data.comment.id as string;
  expect((await report(request, 'COMMENT', cascadeRootId)).status()).toBe(200);
  expect((await report(request, 'COMMENT', cascadeReplyId)).status()).toBe(200);
  const deletedTargetReport = await report(request, 'NOTE', deletedNoteId);
  expect(deletedTargetReport.status()).toBe(200);
  const editable = await request.get(`${apiUrl}/notes/${deletedNoteId}/edit`, {
    headers: cookie(target.session),
  });
  const contentVersion = (await editable.json()).data.contentVersion as number;
  expect(
    (
      await request.delete(`${apiUrl}/notes/${deletedNoteId}`, {
        headers: cookie(target.session),
        data: { expectedContentVersion: contentVersion },
      })
    ).status(),
  ).toBe(200);
  const myReports = await request.get(`${apiUrl}/safety/reports`, {
    headers: cookie(reporter.session),
  });
  expect((await myReports.json()).data.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        targetId: deletedNoteId,
        status: 'TARGET_UNAVAILABLE',
        result: '目标已失效',
      }),
      expect.objectContaining({
        targetId: moderatedNoteId,
        status: 'ACTIONED',
        result: '已采取措施',
      }),
      expect.objectContaining({
        targetId: cascadeRootId,
        status: 'TARGET_UNAVAILABLE',
      }),
      expect.objectContaining({
        targetId: cascadeReplyId,
        status: 'TARGET_UNAVAILABLE',
      }),
    ]),
  );

  const userReport = await report(request, 'USER', target.id);
  expect(userReport.status()).toBe(200);
  const suspend = await request.post(`${apiUrl}/admin/moderation/actions`, {
    headers: cookie(admin.session),
    data: {
      action: 'SUSPEND_USER',
      targetType: 'USER',
      targetId: target.id,
      reason: '自动化验证账号封禁',
    },
  });
  expect((await suspend.json()).data).toMatchObject({
    changed: true,
    state: 'SUSPENDED',
  });
  const invalidatedSession = await request.get(`${apiUrl}/auth/session`, {
    headers: cookie(target.session),
  });
  expect((await invalidatedSession.json()).data.authenticated).toBe(false);
  expect(
    (
      await request.get(`${apiUrl}/users/${target.id}/profile`, {
        headers: cookie(reporter.session),
      })
    ).status(),
  ).toBe(404);
  for (const method of ['get', 'head'] as const) {
    expect((await request[method](moderatedMediaUrl)).status()).toBe(404);
    expect(
      (
        await request[method](moderatedMediaUrl, {
          headers: cookie(reporter.session),
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request[method](moderatedMediaUrl, {
          headers: cookie(admin.session),
        })
      ).status(),
    ).toBe(200);
  }
  const restore = await request.post(`${apiUrl}/admin/moderation/actions`, {
    headers: cookie(admin.session),
    data: {
      action: 'RESTORE_USER',
      targetType: 'USER',
      targetId: target.id,
      reason: '自动化验证账号恢复',
    },
  });
  expect((await restore.json()).data).toMatchObject({
    changed: true,
    state: 'ACTIVE',
  });
  expect(
    (await request.get(`${apiUrl}/users/${target.id}/profile`)).status(),
  ).toBe(200);
  for (const method of ['get', 'head'] as const) {
    expect((await request[method](moderatedMediaUrl)).status()).toBe(200);
  }

  await context.clearCookies();
  await addSession(context, admin.session);
  const adminPageResponse = await page.goto('/admin/moderation');
  expect(adminPageResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '内容治理' })).toBeVisible();
});

test('keeps the safety dialog keyboard-safe across browser engines', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Dialog focus and responsive checks run once per browser engine.',
  );

  await addSession(context, reporter.session);
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto(`/users/${admin.id}`);
  const reportButton = page.getByRole('button', { name: '举报' });
  await expect(reportButton).toBeVisible();
  await reportButton.focus();
  await reportButton.click();
  const dialog = page.getByRole('dialog', { name: '提交举报' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: '色情低俗' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '提交举报' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(reportButton).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= 960),
  ).toBe(true);
});

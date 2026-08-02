import { randomUUID } from 'node:crypto';

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const authorSession = 'spec011-author-session';
const commenterSession = 'spec011-commenter-session';
const peerSession = 'spec011-peer-session';
const commenterId = '00000000-0000-4000-8000-000000000121';
const peerId = '00000000-0000-4000-8000-000000000122';
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
      content: `进阶互动正文：${title}`,
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'engagement-note.png',
        mimeType: 'image/png',
        buffer: blueImage,
      },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()).data as { id: string }).id;
}

async function createComment(
  request: APIRequestContext,
  noteId: string,
  session: string,
  content: string,
): Promise<string> {
  const response = await request.post(`${apiUrl}/notes/${noteId}/comments`, {
    headers: cookie(session),
    data: { content },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()).data.comment as { id: string }).id;
}

async function createReply(
  request: APIRequestContext,
  noteId: string,
  targetId: string,
  session: string,
  content: string,
): Promise<{ id: string; rootCommentId: string; replyTo: { id: string } }> {
  const response = await request.post(
    `${apiUrl}/notes/${noteId}/comments/${targetId}/replies`,
    { headers: cookie(session), data: { content } },
  );
  expect(response.status()).toBe(201);
  return (await response.json()).data.comment;
}

test('persists flattened replies, comment likes, notifications and deduplicated views', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1280',
    'The database contract is browser-independent and runs once.',
  );

  const noteId = await publish(request, `进阶互动-${Date.now()}`);
  const concurrentNoteId = await publish(request, `并发浏览-${Date.now()}`);

  const initialView = await request.post(`${apiUrl}/notes/${noteId}/views`);
  expect(initialView.status()).toBe(200);
  expect((await initialView.json()).data).toEqual({
    counted: true,
    viewCount: 1,
  });
  const initialViewHeaders = initialView.headers();
  const visitorCookie = initialViewHeaders['set-cookie']
    ?.split(';', 1)[0]
    ?.split('=', 2)[1];
  expect(visitorCookie).toBeTruthy();

  const sameVisitorHeaders = {
    Cookie: `lbb_view_visitor=${visitorCookie}`,
  };
  const [firstConcurrent, secondConcurrent] = await Promise.all([
    request.post(`${apiUrl}/notes/${concurrentNoteId}/views`, {
      headers: sameVisitorHeaders,
    }),
    request.post(`${apiUrl}/notes/${concurrentNoteId}/views`, {
      headers: sameVisitorHeaders,
    }),
  ]);
  const concurrentResults = await Promise.all([
    firstConcurrent.json(),
    secondConcurrent.json(),
  ]);
  expect(concurrentResults.map((result) => result.data.counted).sort()).toEqual(
    [false, true],
  );
  expect(concurrentResults.map((result) => result.data.viewCount)).toEqual([
    1, 1,
  ]);

  const authorView = await request.post(
    `${apiUrl}/notes/${concurrentNoteId}/views`,
    { headers: cookie(authorSession) },
  );
  expect((await authorView.json()).data).toEqual({
    counted: false,
    viewCount: 1,
  });
  const authoritativeDetail = await request.get(
    `${apiUrl}/notes/${concurrentNoteId}`,
  );
  expect((await authoritativeDetail.json()).data.interactions.views).toBe(1);
  const malformedCookieDetail = await request.get(`${apiUrl}/notes/${noteId}`, {
    headers: { Cookie: 'lbb_session=%E0%A4%A' },
  });
  expect(malformedCookieDetail.status()).toBe(200);

  const rootId = await createComment(
    request,
    noteId,
    commenterSession,
    '需要展开的一级评论',
  );
  const replyToRoot = await createReply(
    request,
    noteId,
    rootId,
    peerSession,
    '直接回复一级评论',
  );
  const replyToReply = await createReply(
    request,
    noteId,
    replyToRoot.id,
    authorSession,
    '回复另一条回复',
  );
  expect(replyToReply).toMatchObject({
    rootCommentId: rootId,
    replyTo: { id: replyToRoot.id },
  });
  await createReply(request, noteId, rootId, authorSession, '第三条回复');
  await createReply(request, noteId, rootId, peerSession, '第四条回复');

  const commentsResponse = await request.get(
    `${apiUrl}/notes/${noteId}/comments?limit=20`,
    { headers: cookie(authorSession) },
  );
  const comments = (await commentsResponse.json()).data;
  expect(comments.total).toBe(5);
  expect(comments.items[0]).toMatchObject({
    id: rootId,
    replyCount: 4,
  });
  expect(comments.items[0].replies).toHaveLength(3);
  expect(comments.items[0].repliesNextCursor).toBeTruthy();
  expect(
    comments.items[0].replies.map(
      (reply: { content: string }) => reply.content,
    ),
  ).toEqual(['直接回复一级评论', '回复另一条回复', '第三条回复']);

  const remainingReplies = await request.get(
    `${apiUrl}/notes/${noteId}/comments/${rootId}/replies?limit=10&cursor=${encodeURIComponent(comments.items[0].repliesNextCursor)}`,
  );
  expect((await remainingReplies.json()).data.items).toHaveLength(1);

  for (const expectedCount of [1, 1]) {
    const like = await request.put(`${apiUrl}/comments/${rootId}/like`, {
      headers: cookie(authorSession),
    });
    expect((await like.json()).data).toEqual({
      active: true,
      count: expectedCount,
    });
  }
  expect(
    (
      await request.put(`${apiUrl}/comments/${rootId}/like`, {
        headers: cookie(commenterSession),
      })
    ).status(),
  ).toBe(409);

  const commenterNotifications = await request.get(
    `${apiUrl}/notifications?tab=all&limit=20`,
    { headers: cookie(commenterSession) },
  );
  const notificationItems = (await commenterNotifications.json()).data
    .items as Array<{
    type: string;
    comment: { id: string; rootCommentId: string; deleted: boolean } | null;
  }>;
  expect(
    notificationItems.filter((item) => item.type === 'COMMENT_LIKED'),
  ).toHaveLength(1);
  expect(notificationItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'COMMENT_REPLIED',
        comment: expect.objectContaining({
          id: replyToRoot.id,
          rootCommentId: rootId,
        }),
      }),
    ]),
  );

  const crossNoteReply = await request.post(
    `${apiUrl}/notes/${concurrentNoteId}/comments/${rootId}/replies`,
    { headers: cookie(peerSession), data: { content: '跨笔记回复' } },
  );
  expect(crossNoteReply.status()).toBe(404);

  const deletion = await request.delete(
    `${apiUrl}/notes/${noteId}/comments/${rootId}`,
    { headers: cookie(commenterSession) },
  );
  expect((await deletion.json()).data).toEqual({
    deleted: true,
    placeholder: true,
    total: 4,
  });
  const afterDelete = await request.get(
    `${apiUrl}/notes/${noteId}/comments?limit=20`,
  );
  expect((await afterDelete.json()).data.items[0]).toMatchObject({
    id: rootId,
    deleted: true,
    content: null,
    author: null,
    likes: 0,
    replyCount: 4,
  });
});

test('preserves active reply chains through deleted placeholders', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1280',
    'The PostgreSQL deletion contract is browser-independent and runs once.',
  );

  const noteId = await publish(request, `占位引用链-${Date.now()}`);
  const rootId = await createComment(
    request,
    noteId,
    commenterSession,
    '引用链根评论',
  );
  const replyA = await createReply(
    request,
    noteId,
    rootId,
    peerSession,
    '引用链 A',
  );
  const replyB = await createReply(
    request,
    noteId,
    replyA.id,
    commenterSession,
    '引用链 B',
  );
  const replyC = await createReply(
    request,
    noteId,
    replyB.id,
    peerSession,
    '引用链 C',
  );

  const likeA = await request.put(`${apiUrl}/comments/${replyA.id}/like`, {
    headers: cookie(authorSession),
  });
  expect((await likeA.json()).data).toEqual({ active: true, count: 1 });

  const deleteB = await request.delete(
    `${apiUrl}/notes/${noteId}/comments/${replyB.id}`,
    { headers: cookie(commenterSession) },
  );
  expect((await deleteB.json()).data).toEqual({
    deleted: true,
    placeholder: true,
    total: 3,
  });

  const deleteA = await request.delete(
    `${apiUrl}/notes/${noteId}/comments/${replyA.id}`,
    { headers: cookie(peerSession) },
  );
  expect((await deleteA.json()).data).toEqual({
    deleted: true,
    placeholder: true,
    total: 2,
  });

  const commentsResponse = await request.get(
    `${apiUrl}/notes/${noteId}/comments?limit=20`,
  );
  const comments = (await commentsResponse.json()).data;
  expect(comments.total).toBe(2);
  expect(comments.items[0]).toMatchObject({
    id: rootId,
    replyCount: 3,
    replies: [
      { id: replyA.id, deleted: true, content: null, likes: 0 },
      { id: replyB.id, deleted: true, content: null },
      {
        id: replyC.id,
        deleted: false,
        content: '引用链 C',
        replyTo: { id: replyB.id, deleted: true },
      },
    ],
  });
});

test('delivers mutual-follow messages in real time and preserves authority after unfollow', async ({
  browser,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1280',
    'The two-context realtime flow runs once in Chromium.',
  );

  expect((await request.get(`${apiUrl}/messages/conversations`)).status()).toBe(
    401,
  );

  const denied = await request.post(`${apiUrl}/messages/users/${peerId}`, {
    headers: cookie(authorSession),
    data: { content: '不能发送', clientRequestId: randomUUID() },
  });
  expect(denied.status()).toBe(409);

  for (const [session, targetId] of [
    [commenterSession, peerId],
    [peerSession, commenterId],
  ] satisfies Array<readonly [string, string]>) {
    const follow = await request.put(`${apiUrl}/users/${targetId}/follow`, {
      headers: cookie(session),
    });
    expect(follow.status()).toBe(200);
  }

  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  try {
    await addSession(senderContext, commenterSession);
    await addSession(receiverContext, peerSession);
    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();

    await receiverPage.goto('/messages');
    await expect(
      receiverPage.getByRole('status').filter({ hasText: '已连接' }),
    ).toBeVisible();
    await senderPage.goto(`/users/${peerId}`);
    const messageAction = senderPage.locator('.public-profile-message-action');
    await expect(messageAction).toBeEnabled();
    await messageAction.click();
    await expect(senderPage).toHaveURL(/\/messages\?user=/);
    await expect(senderPage.getByText('互相关注，可发送私信')).toBeVisible();

    const realtimeContent = `实时私信-${Date.now()}`;
    await senderPage.getByLabel('消息内容').fill(realtimeContent);
    await senderPage.getByLabel('消息内容').press('Enter');
    await expect(
      senderPage.locator('.message-list li', { hasText: realtimeContent }),
    ).toHaveCount(1);

    await expect(
      receiverPage.getByRole('button', {
        name: new RegExp(`进阶互动蓝友.*${realtimeContent}`),
      }),
    ).toBeVisible();
    expect(
      (
        await (
          await request.get(`${apiUrl}/messages/unread-count`, {
            headers: cookie(peerSession),
          })
        ).json()
      ).data.unreadCount,
    ).toBe(1);

    await receiverPage
      .getByRole('button', {
        name: new RegExp(`进阶互动蓝友.*${realtimeContent}`),
      })
      .click();
    await expect(
      receiverPage.locator('.message-list li', { hasText: realtimeContent }),
    ).toHaveCount(1);
    await expect
      .poll(async () => {
        const unread = await request.get(`${apiUrl}/messages/unread-count`, {
          headers: cookie(peerSession),
        });
        return (await unread.json()).data.unreadCount;
      })
      .toBe(0);
    await expect(
      senderPage.locator('.message-list li.mine').last(),
    ).toContainText('已读');

    await senderPage.setViewportSize({ width: 960, height: 600 });
    await expect(
      senderPage.getByRole('region', { name: '会话列表' }),
    ).toBeVisible();
    await expect(
      senderPage.getByRole('region', { name: '聊天区' }),
    ).toBeVisible();
    expect(
      await senderPage.evaluate(() => ({
        horizontal:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        vertical:
          document.documentElement.scrollHeight >
          document.documentElement.clientHeight,
      })),
    ).toEqual({ horizontal: false, vertical: false });

    await senderPage.setViewportSize({ width: 900, height: 600 });
    await expect(
      senderPage.getByRole('region', { name: '聊天区' }),
    ).toBeVisible();
    await expect(
      senderPage.getByRole('region', { name: '会话列表' }),
    ).toBeHidden();
    await senderPage.getByRole('button', { name: '返回会话列表' }).click();
    await expect(
      senderPage.getByRole('region', { name: '会话列表' }),
    ).toBeVisible();

    const conversations = await request.get(
      `${apiUrl}/messages/conversations`,
      {
        headers: cookie(commenterSession),
      },
    );
    const conversationId = (await conversations.json()).data.items[0]
      .id as string;
    const requestId = randomUUID();
    const retryContent = `幂等重试-${Date.now()}`;
    const firstSend = await request.post(
      `${apiUrl}/messages/conversations/${conversationId}/messages`,
      {
        headers: cookie(commenterSession),
        data: { content: retryContent, clientRequestId: requestId },
      },
    );
    const retriedSend = await request.post(
      `${apiUrl}/messages/conversations/${conversationId}/messages`,
      {
        headers: cookie(commenterSession),
        data: { content: retryContent, clientRequestId: requestId },
      },
    );
    expect((await firstSend.json()).data.message.id).toBe(
      (await retriedSend.json()).data.message.id,
    );

    const forbiddenRead = await request.get(
      `${apiUrl}/messages/conversations/${conversationId}/messages`,
      { headers: cookie(authorSession) },
    );
    expect(forbiddenRead.status()).toBe(404);

    const unfollow = await request.delete(`${apiUrl}/users/${peerId}/follow`, {
      headers: cookie(commenterSession),
    });
    expect(unfollow.status()).toBe(200);
    const blockedSend = await request.post(
      `${apiUrl}/messages/conversations/${conversationId}/messages`,
      {
        headers: cookie(commenterSession),
        data: { content: '取消互关后发送', clientRequestId: randomUUID() },
      },
    );
    expect(blockedSend.status()).toBe(409);
    const readableHistory = await request.get(
      `${apiUrl}/messages/conversations/${conversationId}/messages`,
      { headers: cookie(commenterSession) },
    );
    expect(readableHistory.status()).toBe(200);

    await request.put(`${apiUrl}/users/${peerId}/follow`, {
      headers: cookie(commenterSession),
    });
    const restored = await request.post(
      `${apiUrl}/messages/conversations/${conversationId}/messages`,
      {
        headers: cookie(commenterSession),
        data: { content: '恢复互关后继续', clientRequestId: randomUUID() },
      },
    );
    expect(restored.status()).toBe(201);
    expect((await restored.json()).data.conversationId).toBe(conversationId);
  } finally {
    await senderContext.close();
    await receiverContext.close();
  }
});

test('keeps background messages unread and advances read after visibility recovery', async ({
  browser,
  request,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Visibility recovery runs once per browser engine.',
  );

  for (const [session, targetId] of [
    [commenterSession, peerId],
    [peerSession, commenterId],
  ] satisfies Array<readonly [string, string]>) {
    const follow = await request.put(`${apiUrl}/users/${targetId}/follow`, {
      headers: cookie(session),
    });
    expect(follow.status()).toBe(200);
  }

  const initialContent = `恢复可见初始-${testInfo.project.name}-${Date.now()}`;
  const initialSend = await request.post(
    `${apiUrl}/messages/users/${commenterId}`,
    {
      headers: cookie(peerSession),
      data: { content: initialContent, clientRequestId: randomUUID() },
    },
  );
  expect(initialSend.status()).toBe(201);
  const conversationId = (await initialSend.json()).data
    .conversationId as string;

  const receiverContext = await browser.newContext();
  try {
    await addSession(receiverContext, commenterSession);
    const receiverPage = await receiverContext.newPage();
    await receiverPage.goto(
      `/messages?conversation=${encodeURIComponent(conversationId)}`,
    );
    await expect(
      receiverPage.getByRole('status').filter({ hasText: '已连接' }),
    ).toBeVisible();
    await expect(
      receiverPage.locator('.message-list li', { hasText: initialContent }),
    ).toHaveCount(1);
    await expect
      .poll(async () => {
        const unread = await request.get(`${apiUrl}/messages/unread-count`, {
          headers: cookie(commenterSession),
        });
        return (await unread.json()).data.unreadCount;
      })
      .toBe(0);

    await receiverPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const backgroundContent = `后台未读-${testInfo.project.name}-${Date.now()}`;
    const backgroundSend = await request.post(
      `${apiUrl}/messages/conversations/${conversationId}/messages`,
      {
        headers: cookie(peerSession),
        data: { content: backgroundContent, clientRequestId: randomUUID() },
      },
    );
    expect(backgroundSend.status()).toBe(201);
    await expect(
      receiverPage.locator('.message-list li', { hasText: backgroundContent }),
    ).toHaveCount(1);
    await expect
      .poll(async () => {
        const unread = await request.get(`${apiUrl}/messages/unread-count`, {
          headers: cookie(commenterSession),
        });
        return (await unread.json()).data.unreadCount;
      })
      .toBe(1);

    await receiverPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect
      .poll(async () => {
        const unread = await request.get(`${apiUrl}/messages/unread-count`, {
          headers: cookie(commenterSession),
        });
        return (await unread.json()).data.unreadCount;
      })
      .toBe(0);
  } finally {
    await receiverContext.close();
  }
});

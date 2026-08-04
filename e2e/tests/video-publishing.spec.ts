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
const authorSession = 'spec004-content-session';
const viewerSession = 'spec007-viewer-session';

function cookie(session: string) {
  return { Cookie: `lbb_session=${session}` };
}

async function addSession(
  context: BrowserContext,
  session = authorSession,
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

function videoMultipart(clientRequestId: string, title: string) {
  return {
    title,
    content: '真实视频正文，验证发布、播放、搜索与社区互动。',
    channelCode: 'digital',
    clientRequestId,
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
  };
}

async function publishVideo(
  request: APIRequestContext,
  title: string,
  clientRequestId = randomUUID(),
) {
  return request.post(`${apiUrl}/notes/videos`, {
    headers: cookie(authorSession),
    multipart: videoMultipart(clientRequestId, title),
  });
}

test('publishes a video from the UI and exposes it across the confirmed surfaces', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    testInfo.project.name !== 'chromium-1280',
    'The complete UI publishing flow runs once in Chromium.',
  );
  await addSession(context);
  const title = `视频发布闭环-${Date.now()}`;

  await page.goto('/publish?mode=video');
  await expect(
    page.getByRole('heading', { name: '发布视频笔记' }),
  ).toBeVisible();
  await page.getByLabel('选择笔记视频').setInputFiles({
    name: 'tiny-h264.mp4',
    mimeType: 'video/mp4',
    buffer: tinyH264Mp4,
  });
  await expect(page.getByLabel('待发布视频预览')).toBeVisible();
  await expect(page.getByAltText('视频封面预览')).toBeVisible();
  const imageMode = page.getByRole('radio', { name: '发布图文' });
  await imageMode.click();
  await expect(
    page.getByRole('alertdialog', { name: '切换发布类型' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(imageMode).toBeFocused();
  await page.getByLabel('标题').fill(title);
  await page
    .getByLabel('正文')
    .fill('浏览器端自动提取封面并展示真实上传进度。');
  await page.getByRole('button', { name: '选择频道' }).click();
  await page.getByRole('radio', { name: '数码' }).click();
  const topicToSubmitGap = await page.evaluate(() => {
    const topic = document.querySelector<HTMLElement>('.topic-placeholder');
    const submit = document.querySelector<HTMLElement>('.publish-submit');
    if (!topic || !submit) return -1;
    return (
      submit.getBoundingClientRect().top - topic.getBoundingClientRect().bottom
    );
  });
  expect(topicToSubmitGap).toBeGreaterThanOrEqual(16);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/notes/videos` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发布笔记' }).click();
  const publishProgress = page.getByRole('list', { name: '发布进度' });
  await expect(publishProgress).toBeVisible();
  await expect(publishProgress).toContainText('上传文件');
  await expect(publishProgress).toContainText('校验媒体');
  await expect(publishProgress).toContainText('发布笔记');
  expect((await responsePromise).status()).toBe(201);
  await expect(page).toHaveURL(/\/explore\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel(`${title} 视频`)).toBeVisible();

  await page.goto('/videos');
  await expect(
    page.getByRole('link', { name: `查看笔记：${title}` }),
  ).toBeVisible();
  await expect(page.getByLabel(/视频，时长0:03/)).toBeVisible();

  await page.goto(`/search?keyword=${encodeURIComponent(title)}&type=video`);
  await expect(
    page.getByRole('link', { name: `查看笔记：${title}` }),
  ).toBeVisible();
  await page.goto('/profile');
  await expect(
    page.getByRole('link', { name: `查看笔记：${title}` }),
  ).toBeVisible();
});

test('keeps API publication atomic, idempotent, typed and byte-range capable', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The API protocol is browser-independent and runs once.',
  );
  const title = `视频协议-${Date.now()}`;
  const clientRequestId = randomUUID();

  const unauthenticated = await request.post(`${apiUrl}/notes/videos`, {
    multipart: videoMultipart(randomUUID(), '未登录视频'),
  });
  expect(unauthenticated.status()).toBe(401);

  const invalid = await request.post(`${apiUrl}/notes/videos`, {
    headers: cookie(authorSession),
    multipart: {
      ...videoMultipart(randomUUID(), '伪造视频'),
      video: {
        name: 'forged.mp4',
        mimeType: 'video/mp4',
        buffer: Buffer.from('not an MP4'),
      },
    },
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toMatchObject({ code: 'VIDEO_INVALID' });

  const extraField = await request.post(`${apiUrl}/notes/videos`, {
    headers: cookie(authorSession),
    multipart: {
      ...videoMultipart(randomUUID(), '额外字段视频'),
      unexpected: 'must be rejected before publication',
    },
  });
  expect(extraField.status()).toBe(400);
  expect(await extraField.json()).toMatchObject({
    code: 'VIDEO_MULTIPART_INVALID',
  });

  const extraFile = await request.post(`${apiUrl}/notes/videos`, {
    headers: cookie(authorSession),
    multipart: {
      ...videoMultipart(randomUUID(), '额外文件视频'),
      unexpected: {
        name: 'unexpected.png',
        mimeType: 'image/png',
        buffer: tinyBlueCover,
      },
    },
  });
  expect(extraFile.status()).toBe(400);
  expect(await extraFile.json()).toMatchObject({
    code: 'VIDEO_MULTIPART_INVALID',
  });

  const first = await publishVideo(request, title, clientRequestId);
  const retry = await publishVideo(
    request,
    `${title}-重试改参`,
    clientRequestId,
  );
  expect(first.status()).toBe(201);
  expect(retry.status()).toBe(201);
  const created = (await first.json()).data as { id: string };
  expect((await retry.json()).data.id).toBe(created.id);

  const detail = await request.get(`${apiUrl}/notes/${created.id}`);
  expect(detail.status()).toBe(200);
  const note = (await detail.json()).data as {
    contentType: string;
    images: unknown[];
    video: { url: string; posterUrl: string; durationMs: number };
    interactions: { views: number };
  };
  expect(note).toMatchObject({
    contentType: 'VIDEO',
    images: [],
  });
  expect(note.video.durationMs).toBeGreaterThanOrEqual(3_000);
  expect(note.video.durationMs).toBeLessThan(4_000);

  const head = await request.head(note.video.url);
  expect(head.status()).toBe(200);
  expect(head.headers()['content-type']).toContain('video/mp4');
  expect(Number(head.headers()['content-length'])).toBe(tinyH264Mp4.length);
  expect(await head.body()).toHaveLength(0);

  const range = await request.get(note.video.url, {
    headers: { Range: 'bytes=0-31' },
  });
  expect(range.status()).toBe(206);
  expect(range.headers()['content-range']).toBe(
    `bytes 0-31/${tinyH264Mp4.length}`,
  );
  expect(await range.body()).toEqual(tinyH264Mp4.subarray(0, 32));
  const suffix = await request.get(note.video.url, {
    headers: { Range: 'bytes=-16' },
  });
  expect(suffix.status()).toBe(206);
  expect(await suffix.body()).toEqual(tinyH264Mp4.subarray(-16));
  const multiple = await request.get(note.video.url, {
    headers: { Range: 'bytes=0-1,4-5' },
  });
  expect(multiple.status()).toBe(416);

  for (const endpoint of [
    '/notes/recommendations?limit=20',
    '/notes/channels/digital?limit=20',
    '/notes/videos?limit=20',
    '/notes/mine?limit=20',
  ]) {
    const response = await request.get(
      `${apiUrl}${endpoint}`,
      endpoint.includes('/mine') ? { headers: cookie(authorSession) } : {},
    );
    expect(response.status()).toBe(200);
    const items = (await response.json()).data.items as Array<{
      id: string;
      contentType: string;
    }>;
    expect(items).toContainEqual(
      expect.objectContaining({ id: created.id, contentType: 'VIDEO' }),
    );
  }

  const videoSearch = await request.get(
    `${apiUrl}/search/videos?keyword=${encodeURIComponent(title)}&limit=20`,
  );
  expect(videoSearch.status()).toBe(200);
  expect((await videoSearch.json()).data.items).toContainEqual(
    expect.objectContaining({ id: created.id, contentType: 'VIDEO' }),
  );
  const imageSearch = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent(title)}&limit=20`,
  );
  expect((await imageSearch.json()).data.items).not.toContainEqual(
    expect.objectContaining({ id: created.id }),
  );

  const interactionHeaders = cookie(viewerSession);
  expect(
    (
      await request.put(`${apiUrl}/notes/${created.id}/like`, {
        headers: interactionHeaders,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.put(`${apiUrl}/notes/${created.id}/favorite`, {
        headers: interactionHeaders,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(`${apiUrl}/notes/${created.id}/comments`, {
        headers: interactionHeaders,
        data: { content: '视频评论' },
      })
    ).status(),
  ).toBe(201);
  const afterInteraction = await request.get(`${apiUrl}/notes/${created.id}`, {
    headers: interactionHeaders,
  });
  expect((await afterInteraction.json()).data).toMatchObject({
    interactions: { likes: 1, favorites: 1, comments: 1 },
    viewer: { liked: true, favorited: true },
  });

  const notifications = await request.get(
    `${apiUrl}/notifications?tab=all&limit=20`,
    { headers: cookie(authorSession) },
  );
  const related = (await notifications.json()).data.items.filter(
    (item: { note: { id: string } | null }) => item.note?.id === created.id,
  );
  expect(related.length).toBeGreaterThanOrEqual(2);
  expect(related[0].note.thumbnail.url).toBe(note.video.posterUrl);

  const viewed = await request.post(`${apiUrl}/notes/${created.id}/views`);
  expect(viewed.status()).toBe(200);
  const viewCount = (await viewed.json()).data.viewCount as number;
  await request.get(note.video.url, { headers: { Range: 'bytes=32-63' } });
  const afterRange = await request.get(`${apiUrl}/notes/${created.id}`);
  expect((await afterRange.json()).data.interactions.views).toBe(viewCount);
});

test('loads, plays, pauses and seeks the original MP4 in every browser engine', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Media engine differences run once per Chromium, Firefox and WebKit.',
  );
  const title = `三浏览器视频-${testInfo.project.name}-${Date.now()}`;
  const published = await publishVideo(request, title);
  expect(published.status()).toBe(201);
  const noteId = (await published.json()).data.id as string;

  await page.goto(`/explore/${noteId}`);
  const video = page.getByLabel(`${title} 视频`);
  await expect(video).toBeVisible();
  const [controls, preload, playsInline, crossOrigin, autoplay, poster] =
    await Promise.all([
      video.getAttribute('controls'),
      video.getAttribute('preload'),
      video.getAttribute('playsinline'),
      video.getAttribute('crossorigin'),
      video.getAttribute('autoplay'),
      video.getAttribute('poster'),
    ]);
  expect({ controls, preload, playsInline, crossOrigin, autoplay }).toEqual({
    controls: '',
    preload: 'metadata',
    playsInline: '',
    crossOrigin: 'anonymous',
    autoplay: null,
  });
  expect(poster).toMatch(/\/api\/v1\/media\/[0-9a-f]{48}\.(png|jpg|webp)$/);
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(1);
  expect(
    await video.evaluate((element) => (element as HTMLVideoElement).paused),
  ).toBe(true);

  const playback = await video.evaluate(async (element) => {
    const media = element as HTMLVideoElement;
    media.muted = true;
    media.currentTime = 0;
    const started = new Promise<boolean>((resolve) => {
      media.addEventListener('playing', () => resolve(true), { once: true });
      window.setTimeout(() => resolve(false), 8_000);
    });
    void media.play().catch(() => undefined);
    const didStart = await started;
    return {
      didStart,
      paused: media.paused,
      mediaError: media.error?.code ?? null,
    };
  });
  expect(
    playback,
    `media did not start (error ${playback.mediaError ?? 'none'})`,
  ).toMatchObject({
    didStart: true,
    paused: false,
  });
  await video.evaluate((element) => (element as HTMLVideoElement).pause());
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(true);
  await video.evaluate((element) => {
    (element as HTMLVideoElement).currentTime = 0.5;
  });
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0.25);

  await page.getByRole('button', { name: '返回上一页' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
});

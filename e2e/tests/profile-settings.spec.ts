import { randomUUID } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const chromiumSession = 'spec010-chromium-session';
const chromiumUserId = '00000000-0000-4000-8000-000000000117';
const fallbackImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);
const mediaRoot = process.env.E2E_MEDIA_ROOT;
const mediaFailureMarker = process.env.E2E_MEDIA_FAILURE_MARKER;

type Avatar = { type: 'initial' | 'image'; value: string };

type Settings = {
  nickname: string;
  littleBlueBookId: string;
  email: string;
  gender: 'MALE' | 'FEMALE' | 'PRIVATE';
  birthDate: string | null;
  showAge: boolean;
  bio: string | null;
  avatar: Avatar;
  profileVersion: string;
};

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

function mediaFiles(): string[] {
  if (!mediaRoot) throw new Error('E2E_MEDIA_ROOT is required');
  return existsSync(mediaRoot) ? readdirSync(mediaRoot).sort() : [];
}

function blockMediaStorage(): () => void {
  if (!mediaFailureMarker) {
    throw new Error('E2E_MEDIA_FAILURE_MARKER is required');
  }
  if (existsSync(mediaFailureMarker)) {
    throw new Error('Unexpected media storage failure marker already exists');
  }
  writeFileSync(mediaFailureMarker, 'storage intentionally unavailable');
  return () => {
    unlinkSync(mediaFailureMarker);
  };
}

async function readSettings(
  request: APIRequestContext,
  session: string,
): Promise<Settings> {
  const response = await request.get(`${apiUrl}/profile/me/settings`, {
    headers: cookie(session),
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data as Settings;
}

async function saveSettings(
  request: APIRequestContext,
  session: string,
  current: Settings,
  overrides: Partial<Settings> = {},
) {
  return request.patch(`${apiUrl}/profile/me/settings`, {
    headers: cookie(session),
    multipart: {
      nickname: overrides.nickname ?? current.nickname,
      gender: overrides.gender ?? current.gender,
      birthDate: overrides.birthDate ?? current.birthDate ?? '',
      showAge: String(overrides.showAge ?? current.showAge),
      bio: overrides.bio ?? current.bio ?? '',
      avatarAction: 'keep',
      profileVersion: current.profileVersion,
    },
  });
}

async function createPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 600;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    const gradient = context.createLinearGradient(0, 0, 640, 600);
    gradient.addColorStop(0, '#1677ff');
    gradient.addColorStop(1, '#50c8ff');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 640, 600);
    context.fillStyle = '#ffffff';
    context.font = 'bold 180px sans-serif';
    context.fillText('蓝', 205, 360);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

async function publishHistoricalNote(
  request: APIRequestContext,
  session: string,
  title: string,
): Promise<string> {
  const response = await request.post(`${apiUrl}/notes`, {
    headers: cookie(session),
    multipart: {
      title,
      content: '用于验证资料修改后历史笔记作者信息同步更新',
      channelCode: 'digital',
      clientRequestId: randomUUID(),
      images: {
        name: 'profile-propagation.png',
        mimeType: 'image/png',
        buffer: fallbackImage,
      },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()).data as { id: string }).id;
}

test('edits, propagates, versions, replaces and deletes a complete profile', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'SPEC-010 complete implementation flow runs once in Chromium.',
  );

  const anonymous = await request.get(`${apiUrl}/profile/me/settings`);
  expect(anonymous.status()).toBe(401);

  const noteTitle = `资料传播${Date.now()}`;
  const noteId = await publishHistoricalNote(
    request,
    chromiumSession,
    noteTitle,
  );
  await addSession(context, chromiumSession);

  const startedAt = Date.now();
  await page.goto('/settings/profile');
  await expect(page.getByLabel('正在加载个人资料设置')).toBeVisible();
  await expect(page.getByRole('heading', { name: '编辑资料' })).toBeVisible();
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(250);
  await expect(page.getByLabel('登录邮箱')).toHaveValue(
    'profile-settings-chromium@example.com',
  );
  await expect(page.getByLabel('小蓝书号')).toHaveValue('0000000117');
  await expect(page.getByLabel('登录邮箱')).toHaveAttribute('readonly');
  await expect(page.getByLabel('小蓝书号')).toHaveAttribute('readonly');

  const nickname = `资料蓝友${Date.now().toString().slice(-5)}`;
  await page.getByLabel('昵称').fill(nickname);
  await page.getByLabel('男').check();
  await page.getByRole('combobox', { name: '出生日期，尚未选择' }).click();
  await page.getByLabel('出生年份').selectOption('2000');
  await page.getByLabel('出生月份').selectOption('6');
  await page.getByRole('gridcell', { name: '2000年7月29日' }).click();
  await page.getByRole('checkbox', { name: /公开年龄/ }).check();
  await page.getByLabel('个人简介').fill('纯文本资料简介\n第二行');
  const initialSaveResponse = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/profile/me/settings` &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: '保存' }).click();
  expect((await initialSaveResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: nickname })).toBeVisible();

  const currentResponse = await request.get(`${apiUrl}/profile/me`, {
    headers: cookie(chromiumSession),
  });
  expect(currentResponse.status()).toBe(200);
  expect((await currentResponse.json()).data).toMatchObject({
    nickname,
    gender: '男',
    bio: '纯文本资料简介\n第二行',
  });

  const publicResponse = await request.get(
    `${apiUrl}/users/${chromiumUserId}/profile`,
  );
  const publicBody = (await publicResponse.json()).data as Record<
    string,
    unknown
  >;
  expect(publicResponse.status()).toBe(200);
  expect(publicBody).toMatchObject({
    nickname,
    gender: '男',
    bio: '纯文本资料简介\n第二行',
  });
  expect(publicBody.age).toEqual(expect.any(Number));
  expect(publicBody).not.toHaveProperty('email');
  expect(publicBody).not.toHaveProperty('birthDate');

  const historicalDetail = await request.get(`${apiUrl}/notes/${noteId}`);
  expect((await historicalDetail.json()).data).toMatchObject({
    author: {
      id: chromiumUserId,
      nickname,
      avatar: { type: 'initial', value: Array.from(nickname)[0] },
    },
  });
  const userSearch = await request.get(
    `${apiUrl}/search/users?keyword=${encodeURIComponent(nickname)}`,
  );
  expect((await userSearch.json()).data.items[0]).toMatchObject({
    id: chromiumUserId,
    nickname,
    avatar: { type: 'initial', value: Array.from(nickname)[0] },
  });
  const noteSearch = await request.get(
    `${apiUrl}/search/notes?keyword=${encodeURIComponent(noteTitle)}`,
  );
  expect((await noteSearch.json()).data.items[0]).toMatchObject({
    id: noteId,
    author: {
      id: chromiumUserId,
      nickname,
    },
  });

  await page.goto('/settings/profile');
  await expect(page.getByRole('heading', { name: '编辑资料' })).toBeVisible();
  const png = await createPng(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: png,
  });
  const cropDialog = page.getByRole('dialog', { name: '裁剪头像' });
  await expect(cropDialog).toBeVisible();
  const cropStage = page.getByRole('application', {
    name: /头像裁剪区域/,
  });
  await cropStage.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('slider', { name: '缩放' }).press('ArrowLeft');
  await page.getByRole('button', { name: '确认裁剪' }).click();
  await expect(cropDialog).toBeHidden();
  const avatarSaveResponse = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/profile/me/settings` &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: '保存' }).click();
  expect((await avatarSaveResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/profile$/);

  const avatarSettings = await readSettings(request, chromiumSession);
  expect(avatarSettings.avatar.type).toBe('image');
  const avatarUrl = avatarSettings.avatar.value;
  const avatarResponse = await request.get(avatarUrl);
  expect(avatarResponse.status()).toBe(200);
  expect(avatarResponse.headers()['content-type']).toContain('image/webp');
  const dimensions = await page.evaluate(async (url) => {
    const response = await fetch(url);
    const bitmap = await createImageBitmap(await response.blob());
    return { width: bitmap.width, height: bitmap.height };
  }, avatarUrl);
  expect(dimensions).toEqual({ width: 512, height: 512 });

  const conflictBase = await readSettings(request, chromiumSession);
  const firstSave = await saveSettings(request, chromiumSession, conflictBase, {
    bio: '第一个窗口保存成功',
  });
  expect(firstSave.status()).toBe(200);
  const secondSave = await saveSettings(
    request,
    chromiumSession,
    conflictBase,
    { bio: '第二个窗口不得覆盖' },
  );
  expect(secondSave.status()).toBe(409);
  expect(await secondSave.json()).toMatchObject({
    code: 'PROFILE_VERSION_CONFLICT',
  });
  expect((await readSettings(request, chromiumSession)).bio).toBe(
    '第一个窗口保存成功',
  );

  await page.goto('/settings/profile');
  await expect(page.getByRole('heading', { name: '编辑资料' })).toBeVisible();
  await page.getByRole('button', { name: '删除头像' }).click();
  const deleteSaveResponse = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/profile/me/settings` &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: '保存' }).click();
  expect((await deleteSaveResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/profile$/);
  const deletedAvatar = await readSettings(request, chromiumSession);
  expect(deletedAvatar.avatar).toEqual({
    type: 'initial',
    value: Array.from(deletedAvatar.nickname)[0],
  });
});

test('preserves the form and database profile when Chromium media storage fails', async ({
  context,
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The injected media storage failure runs once in Chromium.',
  );
  await page.route('**/api/v1/media/**', (route) => route.abort());
  await addSession(context, chromiumSession);
  await page.goto('/settings/profile');
  await expect(page.getByRole('heading', { name: '编辑资料' })).toBeVisible();
  const before = await readSettings(request, chromiumSession);
  const beforeFiles = mediaFiles();
  const unsavedBio = `媒体故障保留-${Date.now()}`;
  await page.getByLabel('个人简介').fill(unsavedBio);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'media-failure-avatar.png',
    mimeType: 'image/png',
    buffer: await createPng(page),
  });
  await page.getByRole('button', { name: '确认裁剪' }).click();
  await expect(page.getByRole('dialog', { name: '裁剪头像' })).toBeHidden();

  const restoreStorage = blockMediaStorage();
  try {
    const failureResponse = page.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/profile/me/settings` &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: '保存' }).click();
    const response = await failureResponse;
    expect(response.status()).toBe(500);
    expect(await response.json()).toMatchObject({
      code: 'PROFILE_SAVE_FAILED',
    });
    await expect(page.locator('.settings-save-error')).toContainText(
      '资料保存失败',
    );
    await expect(page.getByLabel('个人简介')).toHaveValue(unsavedBio);
  } finally {
    restoreStorage();
  }

  const after = await readSettings(request, chromiumSession);
  expect(after.profileVersion).toBe(before.profileVersion);
  expect(after.bio).toBe(before.bio);
  expect(mediaFiles()).toEqual(beforeFiles);
});

test('resolves a two-context profile conflict and removes the conflicting avatar', async ({
  browser,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The two-context conflict and avatar compensation run once in Chromium.',
  );
  const contexts: BrowserContext[] = [];
  const createContextPage = async (targetBrowser: Browser) => {
    const context = await targetBrowser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    contexts.push(context);
    await addSession(context, chromiumSession);
    return context.newPage();
  };
  try {
    const [pageA, pageB] = await Promise.all([
      createContextPage(browser),
      createContextPage(browser),
    ]);
    await Promise.all([
      pageA.goto('/settings/profile'),
      pageB.goto('/settings/profile'),
    ]);
    await Promise.all([
      expect(pageA.getByRole('heading', { name: '编辑资料' })).toBeVisible(),
      expect(pageB.getByRole('heading', { name: '编辑资料' })).toBeVisible(),
    ]);

    const firstWindowBio = `窗口A-${Date.now()}`;
    await pageA.getByLabel('个人简介').fill(firstWindowBio);
    const firstResponse = pageA.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/profile/me/settings` &&
        response.request().method() === 'PATCH',
    );
    await pageA.getByRole('button', { name: '保存' }).click();
    expect((await firstResponse).status()).toBe(200);

    await pageB.getByLabel('个人简介').fill('窗口B不得覆盖');
    await pageB.locator('input[type="file"]').setInputFiles({
      name: 'conflicting-avatar.png',
      mimeType: 'image/png',
      buffer: await createPng(pageB),
    });
    await pageB.getByRole('button', { name: '确认裁剪' }).click();
    const beforeConflictFiles = mediaFiles();
    const conflictResponse = pageB.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/profile/me/settings` &&
        response.request().method() === 'PATCH',
    );
    await pageB.getByRole('button', { name: '保存' }).click();
    const conflict = await conflictResponse;
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: 'PROFILE_VERSION_CONFLICT',
    });
    await expect(pageB.locator('.settings-save-error')).toContainText(
      '资料已在其他窗口更新',
    );
    expect(mediaFiles()).toEqual(beforeConflictFiles);
    expect((await readSettings(request, chromiumSession)).bio).toBe(
      firstWindowBio,
    );

    await pageB.getByRole('button', { name: '重新加载' }).click();
    await expect(pageB.getByLabel('正在加载个人资料设置')).toBeVisible();
    await expect(
      pageB.getByRole('heading', { name: '编辑资料' }),
    ).toBeVisible();
    await expect(pageB.getByLabel('个人简介')).toHaveValue(firstWindowBio);

    const retryBio = `窗口B重载后-${Date.now()}`;
    await pageB.getByLabel('个人简介').fill(retryBio);
    const retryResponse = pageB.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/profile/me/settings` &&
        response.request().method() === 'PATCH',
    );
    await pageB.getByRole('button', { name: '保存' }).click();
    expect((await retryResponse).status()).toBe(200);
    await expect(pageB).toHaveURL(/\/profile$/);
    expect((await readSettings(request, chromiumSession)).bio).toBe(retryBio);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('keeps keyboard dialogs and settings usable in browser-difference cases', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !['firefox-1440', 'webkit-1440'].includes(testInfo.project.name),
    'Firefox and WebKit only cover SPEC-010 browser-difference risks.',
  );
  const browserName = testInfo.project.name.split('-')[0]!;
  const session = `spec010-${browserName}-session`;
  await addSession(context, session);
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/settings/profile');
  await expect(page.getByRole('heading', { name: '编辑资料' })).toBeVisible();

  for (const viewport of [
    { width: 960, height: 600 },
    { width: 1080, height: 640 },
    { width: 1210, height: 710 },
    { width: 1000, height: 620 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => ({
      horizontalRootOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      formRight:
        document
          .querySelector('.profile-settings-form')
          ?.getBoundingClientRect().right ?? Infinity,
      viewportWidth: window.innerWidth,
    }));
    expect(geometry.horizontalRootOverflow).toBe(false);
    expect(geometry.formRight).toBeLessThanOrEqual(geometry.viewportWidth);
  }

  await page.getByLabel('个人简介').fill(`未保存-${browserName}`);
  await page.getByRole('button', { name: '取消' }).click();
  const leaveDialog = page.getByRole('dialog', {
    name: '放弃未保存的修改？',
  });
  await expect(leaveDialog).toBeVisible();
  await expect(page.getByRole('button', { name: '继续编辑' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(leaveDialog).toBeHidden();
  await expect(page.getByRole('button', { name: '取消' })).toBeFocused();
  await expect(page.getByLabel('个人简介')).toHaveValue(
    `未保存-${browserName}`,
  );

  const searchTrigger = page.getByRole('button', {
    name: '搜索：搜索感兴趣的内容',
  });
  await searchTrigger.click();
  const searchDialog = page.getByRole('dialog', { name: '搜索小蓝书' });
  await searchDialog.getByLabel('搜索内容').fill('未保存导航');
  await searchDialog.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(leaveDialog).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.keyboard.press('Escape');
  await expect(leaveDialog).toBeHidden();
  await expect(searchTrigger).toBeFocused();

  const png = await createPng(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: `avatar-${browserName}.png`,
    mimeType: 'image/png',
    buffer: png,
  });
  const cropDialog = page.getByRole('dialog', { name: '裁剪头像' });
  await expect(cropDialog).toBeVisible();
  const cropStage = page.getByRole('application', {
    name: /头像裁剪区域/,
  });
  const cropImage = cropStage.locator('img');
  const initialLeft = await cropImage.evaluate(
    (image) => (image as HTMLElement).style.left,
  );
  await cropStage.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() =>
      cropImage.evaluate((image) => (image as HTMLElement).style.left),
    )
    .not.toBe(initialLeft);
  const zoom = page.getByRole('slider', { name: '缩放' });
  const initialZoom = await zoom.inputValue();
  await zoom.focus();
  await page.keyboard.press('ArrowDown');
  await expect(zoom).not.toHaveValue(initialZoom);
  await page.getByRole('button', { name: '确认裁剪' }).click();
  await expect(cropDialog).toBeHidden();
  await expect(page.locator('input[type="file"]')).toBeFocused();
  await expect(page.getByLabel('个人简介')).toHaveValue(
    `未保存-${browserName}`,
  );
});

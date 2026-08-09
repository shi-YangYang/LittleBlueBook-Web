import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const contentSession = 'spec004-content-session';
const portrait =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">' +
      '<rect width="300" height="400" fill="#1677ff"/></svg>',
  );

const representativeViewports = [
  { width: 960, height: 600 },
  { width: 1273, height: 737 },
  { width: 1769, height: 997 },
] as const;

const irregularHomeResizeTrack = [
  { width: 960, height: 600 },
  { width: 1172, height: 656 },
  { width: 1225, height: 612 },
  { width: 1387, height: 673 },
  { width: 1596, height: 705 },
  { width: 1711, height: 829 },
] as const;

function feedNote(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `自适应布局笔记 ${index}`,
    cover: { url: portrait, width: 300, height: 400 },
    author: {
      id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      nickname: '自适应蓝友',
      avatar: { type: 'initial', value: '自' },
    },
    likes: 0,
    liked: false,
    canLike: true,
  };
}

async function addSession(context: BrowserContext): Promise<void> {
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

async function rootLayout(page: Page) {
  return page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

async function publishRootLayout(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const shell = document.querySelector<HTMLElement>('.publish-shell');
    const topbar = document.querySelector<HTMLElement>('.publish-topbar');
    const publishPage = document.querySelector<HTMLElement>('.publish-page');
    const mediaPanel = document.querySelector<HTMLElement>(
      '.publish-media-panel',
    );
    const copyPanel = document.querySelector<HTMLElement>(
      '.publish-copy-panel',
    );
    if (!shell || !topbar || !publishPage || !mediaPanel || !copyPanel) {
      throw new Error('Expected the complete publish page layout.');
    }
    const box = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        height: bounds.height,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        minHeight: styles.minHeight,
        marginTop: styles.marginTop,
        marginBottom: styles.marginBottom,
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
      };
    };
    const optionalBox = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? box(element) : null;
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      html: {
        clientHeight: html.clientHeight,
        scrollHeight: html.scrollHeight,
      },
      body: {
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        offsetHeight: body.offsetHeight,
      },
      shell: box(shell),
      topbar: box(topbar),
      publishPage: box(publishPage),
      mediaPanel: box(mediaPanel),
      copyPanel: box(copyPanel),
      mediaHeading: optionalBox(
        '.publish-media-panel .publish-section-heading',
      ),
      dropzone: optionalBox('.upload-dropzone'),
      copyHeading: optionalBox('.publish-copy-panel .publish-section-heading'),
      titleField: optionalBox('.publish-copy-panel .publish-field'),
      contentField: optionalBox(
        '.publish-copy-panel .publish-field:nth-of-type(2)',
      ),
      channelPicker: optionalBox('.channel-picker'),
      topic: optionalBox('.topic-placeholder'),
      submit: optionalBox('.publish-submit'),
    };
  });
}

function expectNoRootOverflow(
  layout: Awaited<ReturnType<typeof rootLayout>>,
): void {
  expect(layout.scrollHeight - layout.clientHeight).toBeLessThanOrEqual(1);
  expect(layout.scrollWidth - layout.clientWidth).toBeLessThanOrEqual(1);
}

async function homeFeedLayout(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const lastCard = document.querySelector<HTMLElement>(
      '.note-card:last-child',
    );
    const pagination = document.querySelector<HTMLElement>('.feed-pagination');
    if (!lastCard || !pagination) {
      throw new Error('Expected a populated home feed.');
    }
    const cardBounds = lastCard.getBoundingClientRect();
    const paginationBounds = pagination.getBoundingClientRect();
    const meaningfulBottom = Math.max(
      cardBounds.bottom,
      paginationBounds.bottom,
    );
    return {
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      lastCardBottom: cardBounds.bottom,
      paginationBottom: paginationBounds.bottom,
      meaningfulBottom: meaningfulBottom + window.scrollY,
    };
  });
}

test.beforeEach(({ page }, testInfo) => {
  void page;
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Adaptive behavior runs once per configured browser engine.',
  );
});

test('ties home root scrolling to real feed overflow during irregular resizing', async ({
  page,
}) => {
  let notes = [feedNote(1)];
  await page.route('**/api/v1/notes/recommendations?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { data: { items: notes, nextCursor: null } },
    }),
  );

  await page.setViewportSize(irregularHomeResizeTrack[0]);
  await page.goto('/');
  await expect(page.locator('.note-card')).toHaveCount(1);

  for (const viewport of irregularHomeResizeTrack) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await homeFeedLayout(page);
    expect(layout.scrollWidth - layout.clientWidth).toBeLessThanOrEqual(1);
    const expectedRootHeight = Math.max(
      layout.clientHeight,
      Math.ceil(layout.meaningfulBottom),
    );
    expect(
      Math.abs(layout.scrollHeight - expectedRootHeight),
      `unexpected root tail at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`,
    ).toBeLessThanOrEqual(1);
    if (layout.meaningfulBottom <= layout.clientHeight + 1) {
      expect(
        layout.scrollHeight - layout.clientHeight,
        `empty root tail at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`,
      ).toBeLessThanOrEqual(1);
    }
  }

  notes = Array.from({ length: 18 }, (_, index) => feedNote(index + 1));
  await page.setViewportSize(irregularHomeResizeTrack[0]);
  await page.reload();
  await expect(page.locator('.note-card')).toHaveCount(notes.length);
  const longLayout = await homeFeedLayout(page);
  expect(longLayout.meaningfulBottom).toBeGreaterThan(longLayout.clientHeight);
  expect(longLayout.scrollHeight).toBeGreaterThan(longLayout.clientHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('.feed-pagination')).toBeInViewport();
});

test('keeps short root pages fitted while continuously resizing', async ({
  context,
  page,
}) => {
  let mineCount = 1;
  await addSession(context);
  await page.route('**/api/v1/notes/recommendations?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { data: { items: [feedNote(1)], nextCursor: null } },
    }),
  );
  await page.route('**/api/v1/notes/mine?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          items: Array.from({ length: mineCount }, (_, index) =>
            feedNote(index + 1),
          ),
          nextCursor: null,
        },
      },
    }),
  );

  await page.setViewportSize(representativeViewports[0]);
  await page.goto('/');
  await expect(page.locator('.note-card')).toHaveCount(1);
  for (const viewport of representativeViewports) {
    await page.setViewportSize(viewport);
    expectNoRootOverflow(await rootLayout(page));
  }

  await page.setViewportSize(representativeViewports[0]);
  await page.goto('/profile');
  await expect(page.locator('.note-card')).toHaveCount(1);
  for (const viewport of representativeViewports) {
    await page.setViewportSize(viewport);
    expectNoRootOverflow(await rootLayout(page));
  }

  mineCount = 4;
  await page.setViewportSize(representativeViewports[0]);
  await page.reload();
  await expect(page.locator('.note-card')).toHaveCount(4);
  const longProfile = await rootLayout(page);
  expect(longProfile.scrollHeight).toBeGreaterThan(longProfile.clientHeight);
  expect(longProfile.scrollWidth - longProfile.clientWidth).toBeLessThanOrEqual(
    1,
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('.note-card').last()).toBeInViewport();

  await page.goto('/publish');
  await expect(
    page.getByRole('heading', { name: '发布图文笔记' }),
  ).toBeVisible();
  for (const viewport of representativeViewports) {
    await page.setViewportSize(viewport);
    const layout = await publishRootLayout(page);
    if (viewport === representativeViewports[0]) {
      console.info(
        `SPEC-005 publish minimum viewport geometry: ${JSON.stringify(layout)}`,
      );
    }
    expect(
      layout.html.scrollHeight - layout.html.clientHeight,
      `unexpected publish root overflow: ${JSON.stringify(layout)}`,
    ).toBeLessThanOrEqual(1);
  }
});

test('locks the page behind authentication and scrolls only the short dialog', async ({
  page,
}) => {
  await page.route('**/api/v1/notes/recommendations?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          items: Array.from({ length: 18 }, (_, index) => feedNote(index + 1)),
          nextCursor: null,
        },
      },
    }),
  );
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/');
  await expect(page.locator('.note-card')).toHaveCount(18);
  await page.evaluate(() => window.scrollTo(0, 320));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const widthBefore = await page.evaluate(
    () => document.documentElement.clientWidth,
  );

  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '邮箱登录' })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      rootOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      clientWidth: document.documentElement.clientWidth,
    })),
  ).toEqual({
    rootOverflow: 'hidden',
    bodyOverflow: 'hidden',
    clientWidth: widthBefore,
  });

  await page.setViewportSize({ width: 960, height: 480 });
  const dialog = page.getByRole('dialog', { name: '邮箱登录' });
  const dialogLayout = await dialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dialogLayout.scrollHeight).toBeGreaterThan(dialogLayout.clientHeight);
  await dialog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole('button', { name: '登录/注册' }),
  ).toBeInViewport();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() => ({
      rootOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      scrollY: window.scrollY,
    })),
  ).toEqual({
    rootOverflow: '',
    bodyOverflow: '',
    scrollY: scrollBefore,
  });
});

test('keeps detail scrolling internal and restores the feed position on Back', async ({
  context,
  page,
}) => {
  await addSession(context);
  const notes = Array.from({ length: 18 }, (_, index) => feedNote(index + 1));
  await page.route('**/api/v1/notes/recommendations?**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { data: { items: notes, nextCursor: null } },
    }),
  );
  await page.route(/\/api\/v1\/notes\/[0-9a-f-]+$/, (route) => {
    const id =
      route.request().url().split('/').at(-1) ??
      '00000000-0000-4000-8000-000000000001';
    return route.fulfill({
      contentType: 'application/json',
      json: {
        data: {
          id,
          title: '自适应详情',
          content: Array.from(
            { length: 36 },
            (_, index) => `长内容第 ${index + 1} 行`,
          ).join('\n'),
          createdAt: '2026-07-27T00:00:00.000Z',
          author: {
            id: '10000000-0000-4000-8000-000000000001',
            nickname: '自适应蓝友',
            avatar: { type: 'initial', value: '自' },
          },
          channel: {
            code: 'digital',
            name: '数码',
            navigable: true,
          },
          images: [{ url: portrait, width: 300, height: 400 }],
          interactions: { likes: 0, favorites: 0, comments: 0 },
          viewer: {
            authenticated: true,
            isAuthor: false,
            liked: false,
            favorited: false,
            followingAuthor: false,
            canLike: true,
            canFollow: true,
          },
        },
      },
    });
  });
  await page.route(
    /\/api\/v1\/notes\/[0-9a-f-]+\/comments(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        json: { data: { items: [], nextCursor: null } },
      }),
  );
  await page.route(/\/api\/v1\/notes\/[0-9a-f-]+\/views$/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { data: { counted: true, viewCount: 1 } },
    }),
  );

  await page.setViewportSize(representativeViewports[0]);
  await page.goto('/');
  await expect(page.locator('.note-card')).toHaveCount(18);
  await page.evaluate(() => window.scrollTo(0, 700));
  const targetNote = page.getByRole('link', {
    name: '查看笔记：自适应布局笔记 8',
  });
  await targetNote.scrollIntoViewIfNeeded();
  const sourceScroll = await page.evaluate(() => window.scrollY);
  await targetNote.click();
  await expect(page.getByRole('heading', { name: '自适应详情' })).toBeVisible();

  for (const viewport of representativeViewports) {
    await page.setViewportSize(viewport);
    expectNoRootOverflow(await rootLayout(page));
    const detailLayout = await page
      .locator('.detail-scroll')
      .evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
    expect(detailLayout.scrollHeight).toBeGreaterThan(
      detailLayout.clientHeight,
    );
    await expect(page.locator('.detail-media')).toBeInViewport();
    await expect(page.locator('.detail-actions')).toBeInViewport();
  }

  await page.setViewportSize(representativeViewports[0]);
  await page.locator('.detail-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const internalScroll = await page
    .locator('.detail-scroll')
    .evaluate((element) => ({
      scrollTop: element.scrollTop,
      maximum: element.scrollHeight - element.clientHeight,
    }));
  expect(internalScroll.scrollTop).toBe(internalScroll.maximum);

  await page.getByRole('button', { name: '返回上一页' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(sourceScroll - 1);
});

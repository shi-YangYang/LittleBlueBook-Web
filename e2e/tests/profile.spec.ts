import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';

async function addProfileSession(
  context: BrowserContext,
  value = 'spec003-profile-session',
): Promise<void> {
  await context.addCookies([
    {
      name: 'lbb_session',
      value,
      url: frontendUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

type ProfileLayoutSnapshot = {
  html: ElementLayout;
  body: ElementLayout;
  elements: Record<string, ElementLayout | null>;
};

type ElementLayout = {
  scrollWidth: number;
  clientWidth: number;
  offsetWidth: number;
  scrollHeight: number;
  clientHeight: number;
  offsetHeight: number;
  left: number;
  right: number;
  width: number;
  top: number;
  bottom: number;
  height: number;
  minHeight: string;
  paddingTop: string;
  paddingBottom: string;
  marginTop: string;
  marginBottom: string;
  boxSizing: string;
  overflowY: string;
  position: string;
};

async function profileLayout(page: Page): Promise<ProfileLayoutSnapshot> {
  return page.evaluate(() => {
    const inspect = (element: Element): ElementLayout => {
      const htmlElement = element as HTMLElement;
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      return {
        scrollWidth: htmlElement.scrollWidth,
        clientWidth: htmlElement.clientWidth,
        offsetWidth: htmlElement.offsetWidth,
        scrollHeight: htmlElement.scrollHeight,
        clientHeight: htmlElement.clientHeight,
        offsetHeight: htmlElement.offsetHeight,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        minHeight: styles.minHeight,
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
        marginTop: styles.marginTop,
        marginBottom: styles.marginBottom,
        boxSizing: styles.boxSizing,
        overflowY: styles.overflowY,
        position: styles.position,
      };
    };
    const selectors = [
      '.content-shell',
      '.profile-content-shell',
      '.profile-page',
      '.profile-loading',
      '.profile-header',
      '.profile-content',
      '.profile-tabs',
      '.profile-tab-panel:not([hidden])',
    ];

    return {
      html: inspect(document.documentElement),
      body: inspect(document.body),
      elements: Object.fromEntries(
        selectors.map((selector) => {
          const element = document.querySelector(selector);
          return [selector, element ? inspect(element) : null];
        }),
      ),
    };
  });
}

function expectNoRootVerticalOverflow(snapshot: ProfileLayoutSnapshot): void {
  expect(snapshot.html.scrollHeight).toBeLessThanOrEqual(
    snapshot.html.clientHeight,
  );
}

function expectNoRootOverflow(snapshot: ProfileLayoutSnapshot): void {
  expect(snapshot.html.scrollWidth).toBeLessThanOrEqual(
    snapshot.html.clientWidth,
  );
  expectNoRootVerticalOverflow(snapshot);
}

async function newAuthenticatedProfilePage(
  browser: Browser,
  viewportWidth: number,
  viewportHeight = 900,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
  });
  await addProfileSession(context);
  return { context, page: await context.newPage() };
}

async function deferredProfileRequest(page: Page): Promise<{
  observed: Promise<void>;
  release: () => void;
}> {
  let markObserved: (() => void) | undefined;
  let releaseRequest: (() => void) | undefined;
  const observed = new Promise<void>((resolve) => {
    markObserved = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route('**/api/v1/profile/me', async (route) => {
    markObserved?.();
    await gate;
    await route.continue();
  });

  return {
    observed,
    release: () => releaseRequest?.(),
  };
}

test('protects direct profile visits and opens the login modal', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Route protection runs once per browser engine.',
  );

  await page.goto('/profile');

  await expect(page).toHaveURL(`${frontendUrl}/`);
  await expect(page.getByRole('dialog', { name: '邮箱登录' })).toBeVisible();
  await expect(page.getByText(/小蓝书号：/)).toHaveCount(0);
});

test('keeps the root fitted during a fresh-context direct profile visit', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Fresh direct-load regression runs once per browser engine.',
  );

  await addProfileSession(context);
  const request = await deferredProfileRequest(page);
  await page.goto('/profile');
  await request.observed;
  await expect(page.getByLabel('正在加载个人资料')).toBeVisible();

  const loadingLayout = await profileLayout(page);
  expectNoRootVerticalOverflow(loadingLayout);

  request.release();
  await expect(page.getByRole('heading', { name: '多端蓝友' })).toBeVisible();
  const loadedLayout = await profileLayout(page);
  expectNoRootVerticalOverflow(loadedLayout);
});

test('keeps the root fitted during a hard profile refresh', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Hard-refresh regression runs once per browser engine.',
  );

  await addProfileSession(context);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: '多端蓝友' })).toBeVisible();

  const request = await deferredProfileRequest(page);
  await page.reload();
  await request.observed;
  await expect(page.getByLabel('正在加载个人资料')).toBeVisible();

  const loadingLayout = await profileLayout(page);
  expectNoRootVerticalOverflow(loadingLayout);

  request.release();
  await expect(page.getByRole('heading', { name: '多端蓝友' })).toBeVisible();
  const loadedLayout = await profileLayout(page);
  expectNoRootVerticalOverflow(loadedLayout);
});

test('keeps the root fitted after navigating from the homepage', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith('-1440'),
    'Client-navigation regression runs once per browser engine.',
  );

  await addProfileSession(context);
  await page.goto('/');
  const profileEntry = page.getByRole('link', { name: '我' });
  await expect(profileEntry).toBeVisible();

  const request = await deferredProfileRequest(page);
  await profileEntry.click();
  await expect(page).toHaveURL(`${frontendUrl}/profile`);
  await request.observed;
  await expect(page.getByLabel('正在加载个人资料')).toBeVisible();

  const loadingLayout = await profileLayout(page);
  expectNoRootVerticalOverflow(loadingLayout);

  request.release();
  await expect(page.getByRole('heading', { name: '多端蓝友' })).toBeVisible();
  const loadedLayout = await profileLayout(page);
  expectNoRootVerticalOverflow(loadedLayout);
});

for (const viewportWidth of [1200, 1279]) {
  test(`keeps the root fitted on a ${viewportWidth}px fresh direct visit`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-1440',
      'Windows scrollbar-width regression runs once in Chromium.',
    );

    const { context, page } = await newAuthenticatedProfilePage(
      browser,
      viewportWidth,
    );
    try {
      const request = await deferredProfileRequest(page);
      await page.goto('/profile');
      await request.observed;
      await expect(page.getByLabel('正在加载个人资料')).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));
      request.release();
      await expect(
        page.getByRole('heading', { name: '多端蓝友' }),
      ).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));
    } finally {
      await context.close();
    }
  });

  test(`keeps the root fitted on a ${viewportWidth}px hard refresh`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-1440',
      'Windows scrollbar-width regression runs once in Chromium.',
    );

    const { context, page } = await newAuthenticatedProfilePage(
      browser,
      viewportWidth,
    );
    try {
      await page.goto('/profile');
      await expect(
        page.getByRole('heading', { name: '多端蓝友' }),
      ).toBeVisible();
      const request = await deferredProfileRequest(page);
      await page.reload();
      await request.observed;
      await expect(page.getByLabel('正在加载个人资料')).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));
      request.release();
      await expect(
        page.getByRole('heading', { name: '多端蓝友' }),
      ).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));
    } finally {
      await context.close();
    }
  });

  test(`keeps the root fitted after ${viewportWidth}px homepage navigation`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-1440',
      'Windows scrollbar-width regression runs once in Chromium.',
    );

    const { context, page } = await newAuthenticatedProfilePage(
      browser,
      viewportWidth,
    );
    try {
      await page.goto('/');
      const profileEntry = page.getByRole('link', { name: '我' });
      await expect(profileEntry).toBeVisible();
      const request = await deferredProfileRequest(page);
      await profileEntry.click();
      await expect(page).toHaveURL(`${frontendUrl}/profile`);
      await request.observed;
      await expect(page.getByLabel('正在加载个人资料')).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));
      request.release();
      await expect(
        page.getByRole('heading', { name: '多端蓝友' }),
      ).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));
    } finally {
      await context.close();
    }
  });
}

for (const viewport of [
  { width: 850, height: 800 },
  { width: 800, height: 700 },
]) {
  test(`keeps the root fitted while refreshing at ${viewport.width}x${viewport.height}`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-1440',
      'Narrow refresh layout regression runs once in Chromium.',
    );

    const { context, page } = await newAuthenticatedProfilePage(
      browser,
      viewport.width,
      viewport.height,
    );
    try {
      await page.goto('/profile');
      await expect(
        page.getByRole('heading', { name: '多端蓝友' }),
      ).toBeVisible();

      const request = await deferredProfileRequest(page);
      await page.reload();
      await request.observed;
      await expect(page.getByLabel('正在加载个人资料')).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));

      request.release();
      await expect(
        page.getByRole('heading', { name: '多端蓝友' }),
      ).toBeVisible();
      expectNoRootOverflow(await profileLayout(page));
    } finally {
      await context.close();
    }
  });
}

test('keeps document scrolling available for future tall profile content', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'Overflow availability is a CSS regression checked once in Chromium.',
  );

  await addProfileSession(context);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: '多端蓝友' })).toBeVisible();
  await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(
      '.profile-tab-panel:not([hidden])',
    );
    if (!panel) {
      throw new Error('Active profile panel was not found.');
    }
    const tallContent = document.createElement('div');
    tallContent.dataset.testid = 'future-tall-profile-content';
    tallContent.style.height = '2000px';
    tallContent.style.flex = '0 0 2000px';
    panel.append(tallContent);
  });

  const layout = await profileLayout(page);
  expect(layout.html.scrollHeight).toBeGreaterThan(layout.html.clientHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('shows a stable empty profile at every target desktop viewport', async ({
  context,
  page,
}, testInfo) => {
  const viewportWidth = Number(testInfo.project.name.split('-').at(-1));
  const viewportHeights = new Map([
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ]);
  const viewportHeight = viewportHeights.get(viewportWidth);
  if (!viewportHeight) {
    throw new Error(`Unexpected profile viewport width: ${viewportWidth}`);
  }
  await page.setViewportSize({ width: viewportWidth, height: viewportHeight });

  await addProfileSession(context);
  await page.goto('/profile');

  await expect(page.getByRole('heading', { name: '多端蓝友' })).toBeVisible();
  await expect(page.getByText('小蓝书号：0000000104')).toBeVisible();
  await expect(page.getByText('性别：保密')).toBeVisible();
  await expect(page.getByLabel('个人统计')).toContainText(
    '关注0粉丝0获赞与收藏0',
  );
  await expect(page.getByRole('tab', { name: '笔记' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const emptyTabs = [
    ['笔记', '还没有发布笔记'],
    ['收藏', '还没有收藏内容'],
    ['点赞', '还没有点赞内容'],
  ] as const;
  for (const [tabName, emptyMessage] of emptyTabs) {
    await page.getByRole('tab', { name: tabName }).click();
    await expect(page.getByText(emptyMessage)).toBeVisible();
    expectNoRootVerticalOverflow(await profileLayout(page));
  }

  await page.getByRole('tab', { name: '收藏' }).click();
  await page.getByRole('tab', { name: '收藏' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: '点赞' })).toBeFocused();
  await page.getByRole('tab', { name: '点赞' }).press('Enter');
  await expect(page.getByText('还没有点赞内容')).toBeVisible();

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    headerVisible:
      document.querySelector('.profile-header')?.getBoundingClientRect()
        .width ?? 0,
    tabsVisible:
      document.querySelector('.profile-tabs')?.getBoundingClientRect().width ??
      0,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.headerVisible).toBeGreaterThan(0);
  expect(layout.tabsVisible).toBeGreaterThan(0);

  await page.getByRole('link', { name: '发现' }).click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
  await expect(page.getByText('功能开发中')).toHaveCount(0);
});

test('logs out from the profile settings menu', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-1440',
    'The destructive session case runs once in Chromium.',
  );

  await addProfileSession(context, 'spec003-logout-session');
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: '多端蓝友' })).toBeVisible();

  const settings = page.getByRole('button', { name: '个人主页设置' });
  await settings.click();
  await expect(page.getByRole('menuitem', { name: '编辑资料' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menuitem', { name: '退出登录' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();

  await settings.click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${frontendUrl}/`);
  await expect(
    page.getByRole('button', { name: '登录', exact: true }),
  ).toBeVisible();
});

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const testCode = process.env.E2E_TEST_CODE ?? '246810';

function isPrimaryProject(name: string) {
  return name === 'chromium-1440';
}

function isBrowserDifferenceProject(name: string) {
  return name.endsWith('-1440');
}

async function addSession(context: BrowserContext, value: string) {
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

async function openMore(page: Page) {
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await expect(page.getByRole('menu', { name: '更多功能' })).toBeVisible();
}

test.describe('SPEC-012 public information and legal state', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    test.skip(
      !isPrimaryProject(testInfo.project.name),
      '公共页和条款门禁主流程由 Chromium 1440 覆盖。',
    );
  });

  test('renders all public pages without exposing placeholders', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 600 });
    for (const [path, heading] of [
      ['/terms', '小蓝书用户协议'],
      ['/privacy', '小蓝书隐私政策'],
      ['/help', '帮助与反馈'],
      ['/about', '关于小蓝书'],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: heading, level: 1 }),
      ).toBeVisible();
      await expect(page.getByText('法律信息暂不可用')).toHaveCount(0);
      await expect(page.getByText('请填写运营主体')).toHaveCount(0);
      if (path === '/terms') {
        await expect(
          page.getByText('小蓝书自动化测试主体').first(),
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: 'legal-e2e@example.test' }).first(),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      if (path === '/help') {
        await expect(
          page.getByRole('link', { name: /GitHub Issues/ }),
        ).toHaveAttribute('rel', /noopener/);
      }
    }
  });

  test('requires an old session to accept authoritative versions before writes', async ({
    context,
    page,
  }) => {
    await addSession(context, 'spec012-pending-session');
    await page.goto('/profile');
    const dialog = page.getByRole('dialog', { name: '请确认最新条款后继续' });
    await expect(dialog).toBeVisible();

    const blocked = await page.request.post(`${apiUrl}/notes`, {
      headers: {
        Cookie: 'lbb_session=spec012-pending-session',
        Origin: frontendUrl,
      },
      multipart: {},
    });
    expect(blocked.status()).toBe(428);
    expect((await blocked.json()).code).toBe('LEGAL_ACCEPTANCE_REQUIRED');

    await dialog.getByRole('button', { name: '同意并继续' }).click();
    await expect(dialog).toBeHidden();
    const status = await page.request.get(`${apiUrl}/auth/legal-status`, {
      headers: { Cookie: 'lbb_session=spec012-pending-session' },
    });
    expect(await status.json()).toMatchObject({
      data: { authenticated: true, requiresAcceptance: false },
    });
  });

  test('keeps reconfirmation idempotent across concurrent sessions', async ({
    page,
  }) => {
    const responses = await Promise.all([
      page.request.post(`${apiUrl}/auth/legal-acceptance`, {
        headers: {
          Cookie: 'lbb_session=spec012-concurrent-a-session',
          Origin: frontendUrl,
        },
        data: {},
      }),
      page.request.post(`${apiUrl}/auth/legal-acceptance`, {
        headers: {
          Cookie: 'lbb_session=spec012-concurrent-b-session',
          Origin: frontendUrl,
        },
        data: {},
      }),
    ]);

    expect(responses.every((response) => response.ok())).toBe(true);
    for (const response of responses) {
      expect(await response.json()).toMatchObject({
        data: { authenticated: true, requiresAcceptance: false },
      });
    }
  });

  test('shows the age restriction immediately after homepage login', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page
      .getByRole('textbox', { name: '邮箱', exact: true })
      .fill('age-restricted@example.com');
    await page
      .getByRole('checkbox', { name: '同意用户协议与隐私政策' })
      .check();
    const codeResponse = page.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/auth/email-code/request` &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '获取验证码' }).click();
    expect((await codeResponse).ok()).toBe(true);
    await page.getByLabel('验证码').fill(testCode);
    await page.getByRole('button', { name: '登录/注册' }).click();

    await expect(
      page.getByRole('dialog', { name: '当前账号因年龄信息受限' }),
    ).toBeVisible();
  });

  test('shows the confirmed More menu and navigates to About', async ({
    page,
  }) => {
    await page.goto('/');
    await openMore(page);
    expect(await page.getByRole('menuitem').allTextContents()).toEqual([
      '帮助与反馈',
      '用户协议',
      '隐私政策',
    ]);
    await page.getByRole('link', { name: '关于我们', exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
  });
});

test.describe('SPEC-012 browser-difference risks', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    test.skip(
      !isBrowserDifferenceProject(testInfo.project.name),
      '新标签页和焦点差异每个浏览器引擎只在 1440 视口覆盖。',
    );
  });

  test('opens legal text in a new tab without losing login draft', async ({
    context,
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page
      .getByRole('textbox', { name: '邮箱', exact: true })
      .fill('draft@example.com');
    await page
      .getByRole('checkbox', { name: '同意用户协议与隐私政策' })
      .check();

    const [termsPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: '《用户协议》' }).click(),
    ]);
    await termsPage.waitForLoadState('domcontentloaded');
    await expect(
      termsPage.getByRole('heading', { name: '小蓝书用户协议' }),
    ).toBeVisible();
    await termsPage.close();

    await expect(
      page.getByRole('textbox', { name: '邮箱', exact: true }),
    ).toHaveValue('draft@example.com');
    await expect(
      page.getByRole('checkbox', { name: '同意用户协议与隐私政策' }),
    ).toBeChecked();
  });

  test('supports menu keyboard movement, Escape, and focus restoration', async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: '更多', exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    const first = page.getByRole('menuitem', { name: '帮助与反馈' });
    await expect(first).toBeFocused();
    await first.press('ArrowDown');
    await expect(
      page.getByRole('menuitem', { name: '用户协议' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
});

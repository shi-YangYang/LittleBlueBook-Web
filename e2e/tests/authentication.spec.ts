import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3101/api/v1';
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:3100';
const testCode = process.env.E2E_TEST_CODE ?? '246810';

const existingUsers: Record<string, { email: string; nickname: string }> = {
  chromium: {
    email: 'existing-chromium@example.com',
    nickname: '铬蓝用户',
  },
  firefox: {
    email: 'existing-firefox@example.com',
    nickname: '火狐蓝友',
  },
  webkit: {
    email: 'existing-webkit@example.com',
    nickname: '织网蓝友',
  },
};

function browserFamily(projectName: string): string {
  return projectName.split('-')[0] ?? '';
}

function uniqueEmail(prefix: string, projectName: string): string {
  return `${prefix}-${projectName}-${Date.now()}@example.com`;
}

async function openLogin(
  page: Page,
  title: '邮箱登录' | '完善资料' = '邮箱登录',
): Promise<void> {
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
}

async function requestCode(page: Page, email: string): Promise<void> {
  await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(email);
  await page.getByRole('checkbox', { name: '同意用户协议与隐私政策' }).check();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${apiUrl}/auth/email-code/request` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '获取验证码' }).click();
  expect((await responsePromise).ok()).toBe(true);
  await expect(page.getByRole('button', { name: /60秒后重发/ })).toBeDisabled();
}

async function submitCode(page: Page): Promise<void> {
  await page.getByLabel('验证码').fill(testCode);
  await page.getByRole('button', { name: '登录/注册' }).click();
}

async function expectIdentity(page: Page): Promise<void> {
  await expect(
    page.getByRole('link', { name: '我', exact: true }),
  ).toBeVisible();
}

async function addSessionCookie(
  context: BrowserContext,
  value: string,
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

test.describe('core passwordless flows in every browser engine', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    test.skip(
      !testInfo.project.name.endsWith('-1440'),
      'Core auth runs once per engine; all viewports are covered separately.',
    );
  });

  test('logs an existing account in and restores its session after refresh', async ({
    page,
  }, testInfo) => {
    const user = existingUsers[browserFamily(testInfo.project.name)];
    expect(user).toBeDefined();

    const sessionResponse = page.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/auth/session` &&
        response.request().method() === 'GET',
    );
    await page.goto('/');
    expect((await sessionResponse).ok()).toBe(true);
    await openLogin(page);
    await requestCode(page, user!.email);
    await submitCode(page);
    await expectIdentity(page);

    await page.getByRole('link', { name: '我', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(
      page.getByRole('heading', { name: user!.nickname }),
    ).toBeVisible();

    await page.reload();
    await expectIdentity(page);
    await expect(
      page.getByRole('heading', { name: user!.nickname }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('registers a new account after nickname validation', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('new-account', testInfo.project.name);
    const nickname = `蓝友${browserFamily(testInfo.project.name)}`;

    const registrationSessionResponse = page.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/auth/session` &&
        response.request().method() === 'GET',
    );
    await page.goto('/');
    expect((await registrationSessionResponse).ok()).toBe(true);
    await openLogin(page);
    await requestCode(page, email);
    await submitCode(page);
    await expect(page.getByRole('heading', { name: '完善资料' })).toBeVisible();

    await page.getByLabel('昵称').fill('!');
    await page.getByRole('button', { name: '完成注册' }).click();
    await expect(page.locator('.form-error')).toHaveText(
      '昵称需为2～20个中文、字母、数字或下划线',
    );

    await page.getByLabel('昵称').fill(nickname);
    await page.getByRole('button', { name: '完成注册' }).click();
    await expectIdentity(page);

    await page.reload();
    await expectIdentity(page);
  });

  test('enforces terms and email validation and reports remaining attempts', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail('invalid-code', testInfo.project.name);

    await page.goto('/');
    await openLogin(page);
    await page.getByRole('button', { name: '获取验证码' }).click();
    await expect(page.locator('.form-error')).toHaveText(
      '请先阅读并同意用户协议与隐私政策',
    );

    await page
      .getByRole('checkbox', { name: '同意用户协议与隐私政策' })
      .check();
    await page
      .getByRole('textbox', { name: '邮箱', exact: true })
      .fill('not-an-email');
    await page.getByRole('button', { name: '获取验证码' }).click();
    await expect(page.locator('.form-error')).toHaveText(
      '请输入有效的邮箱地址',
    );

    await requestCode(page, email);
    await page.getByLabel('验证码').fill('000000');
    await page.getByRole('button', { name: '登录/注册' }).click();
    await expect(page.locator('.form-error')).toHaveText(
      '验证码错误，还可尝试 4 次',
    );
  });
});

test.describe('registration recovery and multi-device sessions', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page;
    test.skip(
      testInfo.project.name !== 'chromium-1440',
      'Stateful cross-context cases run once in Chromium.',
    );
  });

  test('restores an unexpired registration credential after reload', async ({
    context,
    page,
  }, testInfo) => {
    const email = uniqueEmail('pending-registration', testInfo.project.name);
    const requestResponse = await context.request.post(
      `${apiUrl}/auth/email-code/request`,
      { data: { email, acceptedTerms: true } },
    );
    expect(requestResponse.ok()).toBe(true);
    const verifyResponse = await context.request.post(
      `${apiUrl}/auth/email-code/verify`,
      { data: { email, code: testCode } },
    );
    expect(verifyResponse.ok()).toBe(true);

    await page.goto('/');
    await openLogin(page, '完善资料');
    await expect(page.getByRole('heading', { name: '完善资料' })).toBeVisible();
    await page.getByRole('button', { name: '关闭登录弹窗' }).click();

    await page.reload();
    await openLogin(page, '完善资料');
    await expect(page.getByRole('heading', { name: '完善资料' })).toBeVisible();
  });

  test('uses the exact expired-registration message', async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        name: 'lbb_registration',
        value: 'expired-e2e-registration-token',
        url: frontendUrl,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const expiredSessionResponse = page.waitForResponse(
      (response) =>
        response.url() === `${apiUrl}/auth/session` &&
        response.request().method() === 'GET',
    );
    await page.goto('/');
    expect((await expiredSessionResponse).ok()).toBe(true);
    await openLogin(page);
    await expect(page.locator('.form-error')).toHaveText(
      '验证状态已失效，请重新获取验证码',
    );
  });

  test('logs out only one of two independent device sessions', async ({
    browser,
  }) => {
    const deviceA = await browser.newContext();
    const deviceB = await browser.newContext();

    try {
      await addSessionCookie(deviceA, 'spec002-device-a-session');
      await addSessionCookie(deviceB, 'spec002-device-b-session');
      const pageA = await deviceA.newPage();
      const pageB = await deviceB.newPage();

      await Promise.all([pageA.goto('/'), pageB.goto('/')]);
      await expectIdentity(pageA);
      await expectIdentity(pageB);

      await pageA.getByRole('link', { name: '我', exact: true }).click();
      await expect(pageA).toHaveURL(/\/profile$/);
      await pageA.getByRole('button', { name: '个人主页设置' }).click();
      await pageA.getByRole('menuitem', { name: '退出登录' }).click();
      await expect(
        pageA.getByRole('button', { name: '登录', exact: true }),
      ).toBeVisible();

      await pageB.reload();
      await expectIdentity(pageB);
    } finally {
      await deviceA.close();
      await deviceB.close();
    }
  });
});

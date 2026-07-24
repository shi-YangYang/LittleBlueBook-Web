import { expect, test } from '@playwright/test';

test('matches the configured 3/4/5-column viewport matrix', async ({
  page,
}, testInfo) => {
  await page.goto('/');

  const grid = page.getByTestId('feed-grid');
  await expect(grid).toBeVisible();
  const actualColumns = await grid.evaluate((element) => {
    return Number(getComputedStyle(element).columnCount);
  });
  expect(actualColumns).toBe(testInfo.project.metadata.expectedColumns);

  await expect(page.getByLabel('主菜单')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '搜索，登录探索更多内容' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '登录', exact: true }),
  ).toHaveCount(1);
});

test('keeps the modal visible on backdrop clicks and restores trigger focus', async ({
  page,
}) => {
  await page.goto('/');

  const login = page.getByRole('button', { name: '登录', exact: true });
  await login.click();
  const dialog = page.getByRole('dialog', { name: '邮箱登录' });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '邮箱', exact: true }),
  ).toBeFocused();

  await page.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(login).toBeFocused();

  await login.click();
  await page.getByRole('button', { name: '关闭登录弹窗' }).click();
  await expect(dialog).toBeHidden();
  await expect(login).toBeFocused();
});

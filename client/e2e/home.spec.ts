import { test, expect } from '@playwright/test';

test('home page shows tool cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Giffy')).toBeVisible();
  await expect(page.getByText('選擇工具開始編輯')).toBeVisible();
});

test('theme toggle works', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: '深色模式' }).click();
  await expect(html).toHaveClass(/dark/);
});

test('language toggle works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByText('Choose a tool to get started')).toBeVisible();
});

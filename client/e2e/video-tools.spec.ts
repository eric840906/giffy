import { test, expect } from '@playwright/test';

test.describe('Video Tools', () => {
  test('Video Editor page loads with upload prompt', async ({ page }) => {
    await page.goto('/video/editor');
    await expect(page.getByText('影片編輯器')).toBeVisible();
    await expect(page.getByText(/上傳影片開始編輯/)).toBeVisible();
  });

  test('Old Video Trim path redirects to editor', async ({ page }) => {
    await page.goto('/video/trim');
    await expect(page.getByText('影片編輯器')).toBeVisible();
  });

  test('Old Video Crop path redirects to editor', async ({ page }) => {
    await page.goto('/video/crop');
    await expect(page.getByText('影片編輯器')).toBeVisible();
  });

  test('Old Video Resize path redirects to editor', async ({ page }) => {
    await page.goto('/video/resize');
    await expect(page.getByText('影片編輯器')).toBeVisible();
  });

  test('Old Video Filter path redirects to editor', async ({ page }) => {
    await page.goto('/video/filter');
    await expect(page.getByText('影片編輯器')).toBeVisible();
  });
});

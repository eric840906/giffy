import { test, expect } from '@playwright/test';

test.describe('Video Tools', () => {
  test('Video Trim page loads with upload prompt', async ({ page }) => {
    await page.goto('/video/trim');
    await expect(page.getByText('影片裁切（時間）')).toBeVisible();
    await expect(page.getByText('上傳影片以裁切時間')).toBeVisible();
  });

  test('Video Crop page loads with upload prompt', async ({ page }) => {
    await page.goto('/video/crop');
    await expect(page.getByText('影片裁切（畫面）')).toBeVisible();
    await expect(page.getByText('上傳影片以裁切畫面區域')).toBeVisible();
  });
});

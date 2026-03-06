import { test, expect } from '@playwright/test';

test.describe('Image Tools', () => {
  test('Image Convert page loads with upload prompt', async ({ page }) => {
    await page.goto('/image/convert');
    await expect(page.getByText('圖片格式轉換')).toBeVisible();
    await expect(page.getByText('上傳圖片以轉換格式（PNG、JPG、WebP）')).toBeVisible();
  });

  test('Image Compress page loads with upload prompt', async ({ page }) => {
    await page.goto('/image/compress');
    await expect(page.getByText('圖片壓縮')).toBeVisible();
    await expect(page.getByText('上傳圖片以壓縮檔案大小（PNG、JPG、WebP）')).toBeVisible();
  });
});

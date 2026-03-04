import { test, expect } from '@playwright/test';

test.describe('GIF Tools', () => {
  test('Video to GIF page loads with upload prompt', async ({ page }) => {
    await page.goto('/gif/video-to-gif');
    await expect(page.getByText('影片轉 GIF')).toBeVisible();
    await expect(page.getByText('上傳影片以開始轉換')).toBeVisible();
    await expect(page.getByText('拖放檔案到這裡')).toBeVisible();
  });

  test('Images to GIF page loads with upload prompt', async ({ page }) => {
    await page.goto('/gif/images-to-gif');
    await expect(page.getByText('圖片合成 GIF')).toBeVisible();
    await expect(page.getByText('上傳多張圖片來合成 GIF 動畫')).toBeVisible();
  });

  test('GIF Crop/Resize page loads with upload prompt', async ({ page }) => {
    await page.goto('/gif/crop-resize');
    await expect(page.getByText('GIF 裁切/縮放')).toBeVisible();
    await expect(page.getByText('上傳 GIF 以進行裁切或縮放')).toBeVisible();
  });

  test('Frame Editor page loads with upload prompt', async ({ page }) => {
    await page.goto('/gif/frame-editor');
    await expect(page.getByText('動圖幀編輯器')).toBeVisible();
    await expect(page.getByText(/上傳 GIF/)).toBeVisible();
  });
});

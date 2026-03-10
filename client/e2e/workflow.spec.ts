import { test, expect } from '@playwright/test';

test.describe('Workflow Navigation', () => {
  test('home page tool cards navigate to correct pages', async ({ page }) => {
    await page.goto('/');

    // Click Video to GIF card
    await page.getByText('影片轉 GIF').click();
    await expect(page).toHaveURL('/gif/video-to-gif');
    await expect(page.getByText('上傳影片以開始轉換')).toBeVisible();

    // Navigate back
    await page.goto('/');

    // Click Images to GIF card
    await page.getByText('圖片合成 GIF').click();
    await expect(page).toHaveURL('/gif/images-to-gif');

    await page.goto('/');

    // Click GIF Editor card
    await page.getByText('GIF 編輯器').click();
    await expect(page).toHaveURL('/gif/editor');

    await page.goto('/');

    // Click Video Trim card
    await page.getByText('影片裁切（時間）').click();
    await expect(page).toHaveURL('/video/trim');

    await page.goto('/');

    // Click Video Crop card
    await page.getByText('影片裁切（畫面）').click();
    await expect(page).toHaveURL('/video/crop');

    await page.goto('/');

    // Click Image Convert card
    await page.getByText('圖片格式轉換').click();
    await expect(page).toHaveURL('/image/convert');
  });

  test('unknown routes redirect to home', async ({ page }) => {
    await page.goto('/nonexistent');
    await expect(page).toHaveURL('/');
    await expect(page.getByText('選擇工具開始編輯')).toBeVisible();
  });

  test('nav links navigate between tool categories', async ({ page }) => {
    await page.goto('/');

    // Click GIF Tools nav
    await page.getByRole('link', { name: 'GIF 工具' }).click();
    await expect(page).toHaveURL('/gif/video-to-gif');

    // Click Video Tools nav
    await page.getByRole('link', { name: '影片工具' }).click();
    await expect(page).toHaveURL('/video/trim');

    // Click Image Tools nav
    await page.getByRole('link', { name: '圖片工具' }).click();
    await expect(page).toHaveURL('/image/convert');

    // Click Home
    await page.getByRole('link', { name: '首頁' }).click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Workflow File Upload', () => {
  test('Video Trim shows video player after file upload', async ({ page }) => {
    await page.goto('/video/trim');

    // Create a tiny valid mp4 file and upload it
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('選擇檔案').click();
    const fileChooser = await fileChooserPromise;

    // Use a minimal file — won't play but tests UI state change
    await fileChooser.setFiles({
      name: 'test.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake-video-data'),
    });

    // Upload prompt should be hidden, trim button visible
    await expect(page.getByText('上傳影片以裁切時間')).not.toBeVisible();
    await expect(page.getByRole('button', { name: /裁切/ })).toBeVisible();
  });

  test('Image Convert shows thumbnail grid and format selector after upload', async ({ page }) => {
    await page.goto('/image/convert');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('選擇檔案').click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-data'),
    });

    // Upload prompt hidden, format selector and convert button visible
    await expect(page.getByText('上傳圖片以轉換格式（PNG、JPG、WebP）')).not.toBeVisible();
    await expect(page.getByText('1 張圖片')).toBeVisible();
    await expect(page.getByText('全部轉換')).toBeVisible();
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  test('GIF Editor shows tabs after file upload', async ({ page }) => {
    await page.goto('/gif/editor');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('選擇檔案').click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'test.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('fake-gif-data'),
    });

    // Upload prompt should be hidden
    await expect(page.getByText(/上傳 GIF 以開始編輯/)).not.toBeVisible();
    // Tab navigation should appear
    await expect(page.getByRole('tab', { name: '裁切/縮放' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '速度調整' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '壓縮' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '加文字' })).toBeVisible();
  });
});

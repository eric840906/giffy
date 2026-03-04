import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtures = path.join(__dirname, 'fixtures');

/**
 * Real ffmpeg conversion tests for every tool.
 * These verify that ffmpeg.wasm loads and produces output end-to-end.
 */

test.describe('Video to GIF', () => {
  test('converts video to GIF with palette', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/gif/video-to-gif');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test-video.mp4'));
    await expect(page.getByText('輸出設定')).toBeVisible({ timeout: 10_000 });

    const convertBtn = page.getByRole('button', { name: /轉換/ }).last();
    await expect(convertBtn).toBeEnabled({ timeout: 60_000 });
    await convertBtn.click();

    await expect(page.getByText('轉換結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('Images to GIF', () => {
  test('combines images into animated GIF', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/gif/images-to-gif');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(fixtures, 'test-image-1.png'),
      path.join(fixtures, 'test-image-2.png'),
      path.join(fixtures, 'test-image-3.png'),
    ]);
    await expect(page.getByText('3 張圖片')).toBeVisible({ timeout: 10_000 });

    const genBtn = page.getByRole('button', { name: /生成 GIF/ });
    await expect(genBtn).toBeEnabled({ timeout: 60_000 });
    await genBtn.click();

    await expect(page.getByText('生成結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('GIF Crop/Resize', () => {
  test('resizes a GIF', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/gif/crop-resize');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test.gif'));
    await expect(page.getByText('輸出設定')).toBeVisible({ timeout: 10_000 });

    const applyBtn = page.getByRole('button', { name: /套用/ });
    await expect(applyBtn).toBeEnabled({ timeout: 60_000 });
    await applyBtn.click();

    await expect(page.getByText('處理結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('GIF Speed', () => {
  test('adjusts GIF speed', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/gif/speed');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test.gif'));

    const applyBtn = page.getByRole('button', { name: /套用/ });
    await expect(applyBtn).toBeEnabled({ timeout: 60_000 });
    await applyBtn.click();

    await expect(page.getByText('處理結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('GIF Compress', () => {
  test('compresses a GIF', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/gif/compress');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test.gif'));
    await expect(page.getByText('壓縮設定')).toBeVisible({ timeout: 10_000 });

    const compressBtn = page.getByRole('button', { name: /壓縮/ });
    await expect(compressBtn).toBeEnabled({ timeout: 60_000 });
    await compressBtn.click();

    await expect(page.getByText('壓縮結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('Video Trim', () => {
  test('trims a video', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/video/trim');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test-video.mp4'));

    const trimBtn = page.getByRole('button', { name: /裁切/ });
    await expect(trimBtn).toBeEnabled({ timeout: 60_000 });
    await trimBtn.click();

    await expect(page.getByText('裁切結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('Video Crop', () => {
  test('crops a video frame', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/video/crop');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test-video.mp4'));

    const cropBtn = page.getByRole('button', { name: /裁切區域/ });
    await expect(cropBtn).toBeEnabled({ timeout: 60_000 });
    await cropBtn.click();

    await expect(page.getByText('裁切結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('Video Convert', () => {
  test('converts video to MP4', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/video/convert');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test-video.mp4'));
    await expect(page.getByText('原始資訊')).toBeVisible({ timeout: 10_000 });

    const convertBtn = page.getByRole('button', { name: /轉換/ });
    await expect(convertBtn).toBeEnabled({ timeout: 60_000 });
    await convertBtn.click();

    await expect(page.getByText('轉換結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('Image Convert', () => {
  test('converts image format', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/image/convert');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test-image.jpg'));

    const convertBtn = page.getByRole('button', { name: /全部轉換/ });
    await expect(convertBtn).toBeEnabled({ timeout: 60_000 });
    await convertBtn.click();

    await expect(page.getByText('轉換結果')).toBeVisible({ timeout: 90_000 });
  });
});

test.describe('Video Resize', () => {
  test('resizes a video to 480p', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/video/resize');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test-video.mp4'));

    // Wait for video to load and settings to appear
    await expect(page.getByText('預設大小')).toBeVisible({ timeout: 10_000 });

    // Select 480p preset
    await page.getByLabel(/480p/).click();

    const resizeBtn = page.getByRole('button', { name: /調整大小/ });
    await expect(resizeBtn).toBeEnabled({ timeout: 60_000 });
    await resizeBtn.click();

    await expect(page.getByText('調整結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('Video Screenshot', () => {
  test('captures a screenshot from video', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/video/screenshot');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test-video.mp4'));

    // Wait for video to load
    await expect(page.locator('video')).toBeVisible({ timeout: 10_000 });

    const captureBtn = page.getByRole('button', { name: /擷取/ });
    await expect(captureBtn).toBeEnabled({ timeout: 10_000 });
    await captureBtn.click();

    await expect(page.getByText('1 張截圖')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Frame Editor', () => {
  test('extracts frames from GIF and generates output', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/gif/frame-editor');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test.gif'));

    // Wait for frame extraction to complete (action bar should appear)
    await expect(page.getByText('全選')).toBeVisible({ timeout: 90_000 });

    // Verify frames were extracted (frame count should be visible)
    await expect(page.getByText(/\d+ 幀/)).toBeVisible();

    // Click generate
    const genBtn = page.getByRole('button', { name: /生成/ });
    await expect(genBtn).toBeEnabled({ timeout: 10_000 });
    await genBtn.click();

    await expect(page.getByText('生成結果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/輸出大小/)).toBeVisible();
  });
});

test.describe('Animated Image Convert', () => {
  test('converts GIF to APNG', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/image/animated-convert');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test.gif'));

    // Select APNG format
    const formatSelect = page.locator('#target-format');
    await formatSelect.selectOption('apng');

    const convertBtn = page.getByRole('button', { name: /全部轉換/ });
    await expect(convertBtn).toBeEnabled({ timeout: 60_000 });
    await convertBtn.click();

    await expect(page.getByText('轉換結果')).toBeVisible({ timeout: 90_000 });
  });

  test('converts GIF to animated WebP', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/image/animated-convert');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(fixtures, 'test.gif'));

    // Select WebP format
    const formatSelect = page.locator('#target-format');
    await formatSelect.selectOption('webp');

    const convertBtn = page.getByRole('button', { name: /全部轉換/ });
    await expect(convertBtn).toBeEnabled({ timeout: 60_000 });
    await convertBtn.click();

    await expect(page.getByText('轉換結果')).toBeVisible({ timeout: 90_000 });
  });
});

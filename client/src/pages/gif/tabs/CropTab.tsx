import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import { CropOverlay } from '../../../components/CropOverlay/CropOverlay';
import type { CropRect } from '../../../components/CropOverlay/CropOverlay';
import type { GifTabProps } from './SpeedTab';

/**
 * Crop tab for the GIF Editor.
 * Provides interactive crop overlay and crop area input fields.
 */
export function CropTab({
  gifFile,
  gifUrl,
  imageWidth,
  imageHeight,
  ffmpeg,
  ffmpegLoaded,
  isProcessing,
  onProcessStart,
  onProcessProgress,
  onProcessComplete,
  onProcessError,
}: GifTabProps) {
  const { t } = useTranslation();
  const abortRef = useRef(false);

  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /** Initialize crop when image dimensions become available */
  useEffect(() => {
    if (imageWidth > 0 && imageHeight > 0) {
      setCrop({ x: 0, y: 0, width: imageWidth, height: imageHeight });
    }
  }, [imageWidth, imageHeight]);

  /** Handle crop rectangle change from CropOverlay */
  const handleCropChange = useCallback((newCrop: CropRect) => {
    setCrop(newCrop);
  }, []);

  /** Reset crop to full image */
  const handleResetCrop = useCallback(() => {
    if (imageWidth > 0 && imageHeight > 0) {
      setCrop({ x: 0, y: 0, width: imageWidth, height: imageHeight });
    }
  }, [imageWidth, imageHeight]);

  /**
   * Apply crop using ffmpeg.wasm.
   */
  const handleApply = useCallback(async () => {
    if (!gifFile || !ffmpegLoaded) return;

    abortRef.current = false;
    onProcessStart();

    const onProgress = ({ progress }: { progress: number }) => {
      onProcessProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      const inputName = 'input.gif';
      const outputName = 'output.gif';

      await ffmpeg.writeFile(inputName, await fetchFile(gifFile));
      if (abortRef.current) return;

      const isFullImage =
        Math.round(crop.x) === 0 &&
        Math.round(crop.y) === 0 &&
        Math.round(crop.width) === imageWidth &&
        Math.round(crop.height) === imageHeight;

      if (isFullImage) {
        // No crop needed — nothing to do
        const data = await ffmpeg.readFile(inputName);
        if (abortRef.current) return;
        const blob = new Blob([data as BlobPart], { type: 'image/gif' });
        onProcessComplete(blob);
        await ffmpeg.deleteFile(inputName);
        return;
      }

      const vf = `crop=${Math.round(crop.width)}:${Math.round(crop.height)}:${Math.round(crop.x)}:${Math.round(crop.y)}`;

      const ret = await ffmpeg.exec([
        '-i', inputName,
        '-vf', vf,
        '-y', outputName,
      ]);
      if (abortRef.current) return;
      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'image/gif' });
      onProcessComplete(blob);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Processing failed:', err);
      if (!abortRef.current) {
        onProcessError(t('gifCropResize.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
    }
  }, [gifFile, ffmpegLoaded, ffmpeg, crop, imageWidth, imageHeight, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: CropOverlay */}
      <div className="lg:col-span-2">
        {imageWidth > 0 && imageHeight > 0 ? (
          <>
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              {t('gifCropResize.cropHint')}
            </p>
            <CropOverlay
              src={gifUrl}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              crop={crop}
              onChange={handleCropChange}
            />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('gifCropResize.originalSize', { width: imageWidth, height: imageHeight })}
            </p>
          </>
        ) : (
          <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
            <span className="text-sm text-gray-400">{t('gifCropResize.loadingFFmpeg')}</span>
          </div>
        )}
      </div>

      {/* Right: Settings panel */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {t('gifCropResize.crop')}
        </h2>

        {/* Crop area inputs */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {/* X */}
          <div>
            <label htmlFor="crop-x" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              {t('gifCropResize.cropX')}
            </label>
            <input
              id="crop-x"
              type="number"
              min={0}
              max={imageWidth}
              value={Math.round(crop.x) || ''}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setCrop(prev => ({ ...prev, x: v }));
              }}
              onBlur={() => {
                setCrop(prev => {
                  const x = Math.max(0, Math.min(prev.x, imageWidth - 1));
                  const w = Math.min(prev.width, imageWidth - x);
                  return { ...prev, x, width: Math.max(1, w) };
                });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          {/* Y */}
          <div>
            <label htmlFor="crop-y" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              {t('gifCropResize.cropY')}
            </label>
            <input
              id="crop-y"
              type="number"
              min={0}
              max={imageHeight}
              value={Math.round(crop.y) || ''}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setCrop(prev => ({ ...prev, y: v }));
              }}
              onBlur={() => {
                setCrop(prev => {
                  const y = Math.max(0, Math.min(prev.y, imageHeight - 1));
                  const h = Math.min(prev.height, imageHeight - y);
                  return { ...prev, y, height: Math.max(1, h) };
                });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          {/* Crop Width */}
          <div>
            <label htmlFor="crop-w" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              {t('gifCropResize.cropWidth')}
            </label>
            <input
              id="crop-w"
              type="number"
              min={1}
              max={imageWidth}
              value={Math.round(crop.width) || ''}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setCrop(prev => ({ ...prev, width: v }));
              }}
              onBlur={() => {
                setCrop(prev => {
                  const w = Math.max(1, Math.min(prev.width, imageWidth - prev.x));
                  return { ...prev, width: w };
                });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          {/* Crop Height */}
          <div>
            <label htmlFor="crop-h" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              {t('gifCropResize.cropHeight')}
            </label>
            <input
              id="crop-h"
              type="number"
              min={1}
              max={imageHeight}
              value={Math.round(crop.height) || ''}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setCrop(prev => ({ ...prev, height: v }));
              }}
              onBlur={() => {
                setCrop(prev => {
                  const h = Math.max(1, Math.min(prev.height, imageHeight - prev.y));
                  return { ...prev, height: h };
                });
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        <button
          onClick={handleResetCrop}
          className="self-start rounded-xl border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label={t('gifCropResize.resetCrop')}
        >
          {t('gifCropResize.resetCrop')}
        </button>

        {/* Apply button */}
        <div className="mt-2">
          <button
            onClick={handleApply}
            disabled={isProcessing || !ffmpegLoaded || imageWidth === 0}
            className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('gifCropResize.apply')}
          >
            {t('gifCropResize.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

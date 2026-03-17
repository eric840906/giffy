import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import type { GifTabProps } from './SpeedTab';

/**
 * Resize tab for the GIF Editor.
 * Provides width/height inputs with optional aspect ratio lock.
 */
export function GifResizeTab({
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

  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /** Initialize output dimensions when image dimensions become available */
  useEffect(() => {
    if (imageWidth > 0 && imageHeight > 0) {
      setOutputWidth(imageWidth);
      setOutputHeight(imageHeight);
    }
  }, [imageWidth, imageHeight]);

  /** Handle output width change with optional aspect ratio lock */
  const handleWidthChange = useCallback((newWidth: number) => {
    setOutputWidth(newWidth);
    if (lockAspect && imageWidth > 0 && imageHeight > 0) {
      const aspectRatio = imageWidth / imageHeight;
      setOutputHeight(Math.round(newWidth / aspectRatio));
    }
  }, [lockAspect, imageWidth, imageHeight]);

  /** Handle output height change with optional aspect ratio lock */
  const handleHeightChange = useCallback((newHeight: number) => {
    setOutputHeight(newHeight);
    if (lockAspect && imageWidth > 0 && imageHeight > 0) {
      const aspectRatio = imageWidth / imageHeight;
      setOutputWidth(Math.round(newHeight * aspectRatio));
    }
  }, [lockAspect, imageWidth, imageHeight]);

  /**
   * Apply resize using ffmpeg.wasm.
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

      const safeW = Math.max(1, Math.round(outputWidth));
      const safeH = Math.max(1, Math.round(outputHeight));

      const isSameSize = safeW === imageWidth && safeH === imageHeight;

      if (isSameSize) {
        // No resize needed — return original
        const data = await ffmpeg.readFile(inputName);
        if (abortRef.current) return;
        const blob = new Blob([data as BlobPart], { type: 'image/gif' });
        onProcessComplete(blob);
        await ffmpeg.deleteFile(inputName);
        return;
      }

      const vf = `scale=${safeW}:${safeH}:flags=lanczos`;

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
  }, [gifFile, ffmpegLoaded, ffmpeg, imageWidth, imageHeight, outputWidth, outputHeight, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: Preview */}
      <div className="lg:col-span-2">
        {imageWidth > 0 && imageHeight > 0 ? (
          <>
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <img
                src={gifUrl}
                alt="GIF preview"
                className="max-h-[500px] w-full object-contain"
              />
            </div>
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
          {t('gifCropResize.resize')}
        </h2>

        {/* Width */}
        <div>
          <label htmlFor="gif-resize-width" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
            {t('gifCropResize.width')}
          </label>
          <input
            id="gif-resize-width"
            type="number"
            min={1}
            max={4096}
            value={outputWidth || ''}
            onChange={(e) => handleWidthChange(Number(e.target.value) || 0)}
            onBlur={() => setOutputWidth(Math.max(1, Math.min(4096, outputWidth)))}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Height */}
        <div>
          <label htmlFor="gif-resize-height" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
            {t('gifCropResize.height')}
          </label>
          <input
            id="gif-resize-height"
            type="number"
            min={1}
            max={4096}
            value={outputHeight || ''}
            onChange={(e) => handleHeightChange(Number(e.target.value) || 0)}
            onBlur={() => setOutputHeight(Math.max(1, Math.min(4096, outputHeight)))}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Lock aspect ratio toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={lockAspect}
            onChange={(e) => setLockAspect(e.target.checked)}
            className="rounded accent-mint-600"
          />
          {t('gifCropResize.lockAspectRatio')}
        </label>

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

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import { formatSize } from '../../../utils/formatSize';
import type { VideoTabProps } from './index';

/** Preset resolution option */
type Preset = 'original' | '1080' | '720' | '480' | 'custom';

/**
 * Resize tab for the Video Editor.
 * Provides preset resolutions (1080p/720p/480p) and custom width/height with aspect ratio lock.
 * CRITICAL: uses `-threads 1` to prevent pthread deadlock with scale + libx264.
 */
export function ResizeTab({
  videoFile,
  videoUrl,
  videoWidth,
  videoHeight,
  ffmpeg,
  ffmpegLoaded,
  isProcessing,
  onProcessStart,
  onProcessProgress,
  onProcessComplete,
  onProcessError,
}: VideoTabProps) {
  const { t } = useTranslation();
  const abortRef = useRef(false);

  const [preset, setPreset] = useState<Preset>('original');
  const [customWidth, setCustomWidth] = useState<number>(0);
  const [customHeight, setCustomHeight] = useState<number>(0);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  /** Initialise custom dims from detected video dimensions */
  useEffect(() => {
    if (videoWidth > 0 && videoHeight > 0) {
      setCustomWidth(videoWidth);
      setCustomHeight(videoHeight);
    }
  }, [videoWidth, videoHeight]);

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /** Compute target dimensions for a preset */
  const getPresetDimensions = useCallback((p: Preset): { w: number; h: number } | null => {
    if (p === 'original' || p === 'custom' || !videoWidth || !videoHeight) return null;
    const targetH = Number(p);
    const aspect = videoWidth / videoHeight;
    const targetW = Math.round((targetH * aspect) / 2) * 2;
    return { w: targetW, h: targetH };
  }, [videoWidth, videoHeight]);

  /** Handle preset change — sync custom width/height */
  const handlePresetChange = useCallback((newPreset: Preset) => {
    setPreset(newPreset);
    if (newPreset === 'original') {
      setCustomWidth(videoWidth);
      setCustomHeight(videoHeight);
    } else if (newPreset !== 'custom') {
      const dims = getPresetDimensions(newPreset);
      if (dims) {
        setCustomWidth(dims.w);
        setCustomHeight(dims.h);
      }
    }
  }, [videoWidth, videoHeight, getPresetDimensions]);

  /** Handle custom width change with optional aspect lock */
  const handleWidthChange = useCallback((w: number) => {
    setCustomWidth(w);
    if (lockAspectRatio && videoWidth && videoHeight && w > 0) {
      const aspect = videoWidth / videoHeight;
      setCustomHeight(Math.round(w / aspect / 2) * 2);
    }
  }, [lockAspectRatio, videoWidth, videoHeight]);

  /** Handle custom height change with optional aspect lock */
  const handleHeightChange = useCallback((h: number) => {
    setCustomHeight(h);
    if (lockAspectRatio && videoWidth && videoHeight && h > 0) {
      const aspect = videoWidth / videoHeight;
      setCustomWidth(Math.round((h * aspect) / 2) * 2);
    }
  }, [lockAspectRatio, videoWidth, videoHeight]);

  /**
   * Resize video using ffmpeg.wasm (H.264 + AAC).
   * CRITICAL: `-threads 1` prevents pthread deadlock with scale + libx264.
   */
  const handleResize = useCallback(async () => {
    if (!videoFile || !ffmpegLoaded) return;

    abortRef.current = false;
    onProcessStart();

    const onProgress = ({ progress }: { progress: number }) => {
      onProcessProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      const ext = videoFile.name?.includes('.')
        ? videoFile.name.substring(videoFile.name.lastIndexOf('.'))
        : '.mp4';
      const inputName = `input${ext}`;
      const outputName = 'resized.mp4';

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      const args: string[] = ['-i', inputName];

      if (preset === 'original') {
        // No scaling, just re-encode
      } else if (preset === 'custom') {
        const w = Math.round(customWidth / 2) * 2;
        const h = Math.round(customHeight / 2) * 2;
        args.push('-vf', `scale=${w}:${h}`);
      } else {
        args.push('-vf', `scale=-2:${preset}`);
      }

      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
      args.push('-c:a', 'aac', '-b:a', '128k');
      // -threads 1 prevents pthread deadlock with scale filter + libx264
      args.push('-threads', '1');
      args.push('-y', outputName);

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;
      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      onProcessComplete(blob);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Resize failed:', err);
      if (!abortRef.current) {
        onProcessError(t('videoResize.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
    }
  }, [videoFile, ffmpegLoaded, ffmpeg, preset, customWidth, customHeight, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  /** Preset options for radio buttons */
  const presetOptions: { value: Preset; label: string }[] = [
    { value: 'original', label: t('videoResize.presetOriginal') },
    { value: '1080', label: '1080p' },
    { value: '720', label: '720p' },
    { value: '480', label: '480p' },
    { value: 'custom', label: t('videoResize.custom') },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: Video player and original info */}
      <div className="lg:col-span-2">
        <video
          src={videoUrl}
          controls
          className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
          aria-label={t('videoResize.title')}
        />
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 px-4 py-2 dark:bg-gray-800">
          {videoWidth > 0 && videoHeight > 0 && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {t('videoResize.originalSize', { width: videoWidth, height: videoHeight })}
            </span>
          )}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {formatSize(videoFile.size)}
          </span>
        </div>
      </div>

      {/* Right: Settings panel */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
            {t('videoResize.preset')}
          </h2>
          <div className="flex flex-col gap-2">
            {presetOptions.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <input
                  type="radio"
                  name="preset"
                  value={opt.value}
                  checked={preset === opt.value}
                  onChange={() => handlePresetChange(opt.value)}
                  className="accent-mint-600"
                />
                <span className="text-gray-700 dark:text-gray-200">
                  {opt.label}
                  {opt.value !== 'original' && opt.value !== 'custom' && videoWidth > 0 && (
                    <span className="ml-1 text-xs text-gray-400">
                      ({getPresetDimensions(opt.value)?.w} × {Number(opt.value)})
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Custom width/height inputs */}
        {preset === 'custom' && (
          <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50">
            <div>
              <label htmlFor="custom-width" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('videoResize.width')}
              </label>
              <input
                id="custom-width"
                type="number"
                min={2}
                step={2}
                value={customWidth}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="custom-height" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('videoResize.height')}
              </label>
              <input
                id="custom-height"
                type="number"
                min={2}
                step={2}
                value={customHeight}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={lockAspectRatio}
                onChange={(e) => setLockAspectRatio(e.target.checked)}
                className="accent-mint-600"
              />
              {t('videoResize.lockAspectRatio')}
            </label>
          </div>
        )}

        {/* Resize button */}
        <div className="mt-2">
          <button
            onClick={handleResize}
            disabled={isProcessing || !ffmpegLoaded}
            className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('videoResize.resize')}
          >
            {t('videoResize.resize')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import type { GifTabProps } from './SpeedTab';
import { formatSize } from '../../../utils/formatSize';

/** Lossy compression level presets mapping to bayer_scale values */
type LossyLevel = 'low' | 'medium' | 'high';

/** Bayer scale values for each lossy level */
const LOSSY_BAYER_SCALE: Record<LossyLevel, number> = {
  low: 1,
  medium: 3,
  high: 5,
} as const;

/** Available frame drop options (1 = off, N = drop every Nth frame) */
const DROP_FRAME_OPTIONS = [1, 2, 3, 4] as const;

/**
 * Compression/Optimization tab for the GIF Editor.
 * Uses two-pass palette optimization: palettegen → paletteuse with dithering.
 */
export function CompressTab({
  gifFile,
  gifUrl,
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

  const [colors, setColors] = useState<number>(128);
  const [lossyLevel, setLossyLevel] = useState<LossyLevel>('medium');
  const [dropFrames, setDropFrames] = useState<number>(1);
  const [resizeWidth, setResizeWidth] = useState<number>(0);

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /**
   * Build the ffmpeg video filter chain based on current settings.
   */
  const buildBaseFilters = useCallback((): string[] => {
    const filters: string[] = [];

    if (dropFrames > 1) {
      filters.push(`select='not(mod(n\\,${dropFrames}))'`);
      filters.push('setpts=N/FRAME_RATE/TB');
    }

    if (resizeWidth > 0) {
      filters.push(`scale=${resizeWidth}:-1:flags=lanczos`);
    }

    return filters;
  }, [dropFrames, resizeWidth]);

  /**
   * Compress the GIF using two-pass palette optimization via ffmpeg.wasm.
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
      const paletteName = 'palette.png';
      const outputName = 'output.gif';

      await ffmpeg.writeFile(inputName, await fetchFile(gifFile));
      if (abortRef.current) return;

      const baseFilters = buildBaseFilters();
      const vfBase = baseFilters.length > 0 ? baseFilters.join(',') + ',' : '';
      const bayerScale = LOSSY_BAYER_SCALE[lossyLevel];

      // Pass 1: Generate optimized palette
      const pass1Args = [
        '-i', inputName,
        '-vf', `${vfBase}palettegen=max_colors=${colors}:stats_mode=diff`,
        '-threads', '1',
        '-y', paletteName,
      ];

      const ret1 = await ffmpeg.exec(pass1Args);
      if (abortRef.current) return;
      if (ret1 !== 0) throw new Error(`ffmpeg palette generation exited with code ${ret1}`);

      // Pass 2: Apply palette with dithering
      let filterComplex: string;
      if (vfBase) {
        filterComplex = `[0:v]${vfBase.slice(0, -1)}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=${bayerScale}`;
      } else {
        filterComplex = `[0:v][1:v]paletteuse=dither=bayer:bayer_scale=${bayerScale}`;
      }

      const pass2Args = [
        '-i', inputName,
        '-i', paletteName,
        '-filter_complex', filterComplex,
        '-threads', '1',
        '-filter_threads', '1',
        '-filter_complex_threads', '1',
        '-y', outputName,
      ];

      const ret2 = await ffmpeg.exec(pass2Args);
      if (abortRef.current) return;
      if (ret2 !== 0) throw new Error(`ffmpeg compression exited with code ${ret2}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'image/gif' });
      onProcessComplete(blob);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(paletteName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Compression failed:', err);
      if (!abortRef.current) {
        onProcessError(t('gifCompress.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
    }
  }, [gifFile, ffmpegLoaded, ffmpeg, colors, lossyLevel, buildBaseFilters, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: GIF preview */}
      <div className="lg:col-span-2">
        <div className="flex items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
          <img src={gifUrl} alt="preview" className="max-h-96 max-w-full object-contain" />
        </div>
      </div>

      {/* Right: Compression settings */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {t('gifCompress.settings')}
        </h2>

        {/* Colors slider */}
        <div>
          <label
            htmlFor="colors-slider"
            className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
          >
            {t('gifCompress.colors')}
          </label>
          <input
            id="colors-slider"
            type="range"
            min={2}
            max={256}
            step={1}
            value={colors}
            onChange={(e) => setColors(Number(e.target.value))}
            className="w-full accent-mint-600"
            aria-label={t('gifCompress.colors')}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('gifCompress.colorsValue', { count: colors })}
          </p>
        </div>

        {/* Lossy level buttons */}
        <div>
          <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-300">
            {t('gifCompress.lossyLevel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setLossyLevel(level)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  lossyLevel === level
                    ? 'bg-mint-600 text-white'
                    : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
                aria-pressed={lossyLevel === level}
              >
                {t(`gifCompress.lossy${level.charAt(0).toUpperCase() + level.slice(1)}` as
                  'gifCompress.lossyLow' | 'gifCompress.lossyMedium' | 'gifCompress.lossyHigh')}
              </button>
            ))}
          </div>
        </div>

        {/* Drop frames buttons */}
        <div>
          <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-300">
            {t('gifCompress.dropFrames')}
          </p>
          <div className="flex flex-wrap gap-2">
            {DROP_FRAME_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setDropFrames(n)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  dropFrames === n
                    ? 'bg-mint-600 text-white'
                    : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
                aria-pressed={dropFrames === n}
              >
                {n === 1
                  ? t('gifCompress.dropFramesOff')
                  : t('gifCompress.dropFramesEvery', { n })}
              </button>
            ))}
          </div>
        </div>

        {/* Resize width input */}
        <div>
          <label
            htmlFor="compress-resize-width"
            className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
          >
            {t('gifCompress.width')}
          </label>
          <input
            id="compress-resize-width"
            type="number"
            min={0}
            value={resizeWidth}
            onChange={(e) => setResizeWidth(Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('gifCompress.keepOriginalSize')}
          </p>
        </div>

        {/* Original file size */}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('gifCompress.originalFileSize', { size: formatSize(gifFile.size) })}
        </p>

        {/* Compress button */}
        <div className="mt-2">
          <button
            onClick={handleApply}
            disabled={isProcessing || !ffmpegLoaded}
            className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('gifCompress.compress')}
          >
            {t('gifCompress.compress')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

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
 * GIF Compression/Optimization page.
 * Upload a GIF -> configure compression settings -> compress -> download.
 *
 * Uses a two-pass palette optimization approach via ffmpeg.wasm:
 *   Pass 1: Generate an optimized palette with reduced colors.
 *   Pass 2: Apply the palette with dithering to produce a compressed GIF.
 *
 * All processing happens client-side via ffmpeg.wasm.
 */
export function GifCompress() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // GIF state
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [gifUrl, setGifUrl] = useState<string>('');

  // Compression settings
  const [colors, setColors] = useState<number>(128);
  const [lossyLevel, setLossyLevel] = useState<LossyLevel>('medium');
  const [dropFrames, setDropFrames] = useState<number>(1);
  const [resizeWidth, setResizeWidth] = useState<number>(0);

  // Output
  const [outputGif, setOutputGif] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  /**
   * Handle GIF file selection.
   * Creates an object URL for the image preview and resets processing state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (gifUrl) URL.revokeObjectURL(gifUrl);

    setGifFile(file);
    const url = URL.createObjectURL(file);
    setGifUrl(url);
    setOutputGif(null);
    setProcessingError(null);
  }, [gifUrl]);

  /** Load ffmpeg on mount */
  useEffect(() => {
    if (!loaded && !ffmpegLoading) {
      load();
    }
  }, [loaded, ffmpegLoading, load]);

  /** Handle file from workflow (passed via router state) */
  useEffect(() => {
    const state = location.state as { file?: File; fileName?: string } | null;
    if (state?.file && state.file !== handledStateRef.current) {
      handledStateRef.current = state.file;
      handleFileSelect([state.file]);
    }
  }, [location.state, handleFileSelect]);

  /** Cleanup GIF URL on unmount and abort in-flight operations */
  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
      abortRef.current = true;
    };
  }, [gifUrl]);

  /**
   * Build the ffmpeg video filter chain based on current settings.
   * Combines frame dropping, scaling, and palette generation/application filters.
   *
   * @returns Array of filter strings to join with commas
   */
  const buildBaseFilters = useCallback((): string[] => {
    const filters: string[] = [];

    // Frame dropping: select every Nth frame and fix timing
    if (dropFrames > 1) {
      filters.push(`select='not(mod(n\\,${dropFrames}))'`);
      filters.push('setpts=N/FRAME_RATE/TB');
    }

    // Scale if resize width is specified (positive value)
    if (resizeWidth > 0) {
      filters.push(`scale=${resizeWidth}:-1:flags=lanczos`);
    }

    return filters;
  }, [dropFrames, resizeWidth]);

  /**
   * Compress the GIF using two-pass palette optimization via ffmpeg.wasm.
   *
   * Pass 1: Generate optimized palette with user-defined color count.
   * Pass 2: Apply palette with bayer dithering at the chosen lossy level.
   *
   * Temp files (input.gif, palette.png, output.gif) are cleaned up after processing.
   */
  const handleCompress = useCallback(async () => {
    if (!gifFile || !loaded) return;

    abortRef.current = false;
    setIsProcessing(true);
    setProcessProgress(0);
    setOutputGif(null);
    setProcessingError(null);

    const onProgress = ({ progress }: { progress: number }) => {
      setProcessProgress(Math.round(progress * 100));
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
      // Note: -threads 1 prevents pthread deadlocks in ffmpeg.wasm multi-thread build
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
        // Base filters already include timing correction (setpts) if frame dropping
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

      const blob = new Blob([data], { type: 'image/gif' });
      setOutputGif(blob);

      // Clean up ffmpeg temp files to free memory
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(paletteName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Compression failed:', err);
      if (!abortRef.current) {
        setProcessingError(t('gifCompress.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsProcessing(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [gifFile, loaded, ffmpeg, colors, lossyLevel, buildBaseFilters, t]);

  /**
   * Reset file selection and return to the upload view.
   * Revokes all object URLs and clears output/error state.
   */
  const handleReset = useCallback(() => {
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    setGifFile(null);
    setGifUrl('');
    setOutputGif(null);
    setProcessingError(null);
  }, [gifUrl]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputGif(null);
    setProcessingError(null);
  }, []);

  /**
   * Calculate savings percentage between original and compressed sizes.
   *
   * @param originalSize - Original file size in bytes
   * @param compressedSize - Compressed file size in bytes
   * @returns Savings percentage rounded to one decimal place
   */
  const calculateSavings = (originalSize: number, compressedSize: number): string => {
    if (originalSize === 0) return '0';
    const percent = ((originalSize - compressedSize) / originalSize) * 100;
    return Math.max(0, percent).toFixed(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('gifCompress.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('gifCompress.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!gifFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('gifCompress.uploadPrompt')}
          </p>
          <Upload accept="image/gif" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* File info bar with change file button */}
      {gifFile && (
        <div className="flex items-center justify-between rounded-xl bg-gray-100 px-4 py-2 dark:bg-gray-800">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
              {gifFile.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {formatSize(gifFile.size)}
            </span>
          </div>
          <button
            onClick={handleReset}
            disabled={isProcessing}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('upload.changeFile')}
          </button>
        </div>
      )}

      {/* Editor section */}
      {gifFile && gifUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: GIF preview */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
              <img
                src={gifUrl}
                alt="preview"
                className="max-h-96 max-w-full object-contain"
              />
            </div>
          </div>

          {/* Right: Compression settings panel */}
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
                className="w-full accent-purple-600"
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
                        ? 'bg-purple-600 text-white'
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
                        ? 'bg-purple-600 text-white'
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
                htmlFor="resize-width"
                className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {t('gifCompress.width')}
              </label>
              <input
                id="resize-width"
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
                onClick={handleCompress}
                disabled={isProcessing || !loaded}
                className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('gifCompress.compress')}
              >
                {isProcessing
                  ? t('gifCompress.compressProgress', { progress: processProgress })
                  : t('gifCompress.compress')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processing error alert */}
      {processingError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {processingError}
        </div>
      )}

      {/* Processing progress bar */}
      {isProcessing && (
        <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-purple-600 transition-all"
            style={{ width: `${processProgress}%` }}
            role="progressbar"
            aria-valuenow={processProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Output section */}
      {outputGif && !isProcessing && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                {t('gifCompress.result')}
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('gifCompress.outputSize', { size: formatSize(outputGif.size) })}
              </span>
            </div>
            {gifFile && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  {t('gifCompress.beforeAfter', {
                    before: formatSize(gifFile.size),
                    after: formatSize(outputGif.size),
                  })}
                </span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {t('gifCompress.savings', {
                    percent: calculateSavings(gifFile.size, outputGif.size),
                  })}
                </span>
              </div>
            )}
          </div>
          <Preview file={outputGif} type="image/gif" />
          <WorkflowBar
            file={outputGif}
            fileName="compressed.gif"
            currentTool="gifCompress"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

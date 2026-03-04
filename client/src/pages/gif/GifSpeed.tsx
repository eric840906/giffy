import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Available speed multiplier presets */
const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3] as const;

/** Speed control mode: preset buttons or custom delay input */
type SpeedMode = 'preset' | 'custom';

/**
 * GIF Speed adjustment page.
 * Upload a GIF -> choose speed multiplier or custom delay -> apply -> download.
 *
 * All processing happens client-side via ffmpeg.wasm.
 * - Preset mode: uses setpts filter to scale presentation timestamps.
 * - Custom delay mode: re-encodes with a target frame rate derived from the delay.
 */
export function GifSpeed() {
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

  // Speed settings
  const [speedMode, setSpeedMode] = useState<SpeedMode>('preset');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [customDelay, setCustomDelay] = useState<number>(100);

  // Output
  const [outputGif, setOutputGif] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  /**
   * Handle GIF file selection.
   * Creates an object URL for the image and resets processing state.
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
   * Apply speed adjustment using ffmpeg.wasm.
   * - Preset mode: uses `-vf "setpts=PTS/SPEED"` to scale timestamps.
   * - Custom delay mode: calculates target fps from delay and uses `-r fps`.
   */
  const handleApply = useCallback(async () => {
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
      const outputName = 'output.gif';

      await ffmpeg.writeFile(inputName, await fetchFile(gifFile));
      if (abortRef.current) return;

      let args: string[];

      if (speedMode === 'preset') {
        // Use setpts filter to adjust speed by scaling presentation timestamps
        const ptsFactor = 1 / speedMultiplier;
        args = [
          '-i', inputName,
          '-filter_complex', `[0:v]setpts=${ptsFactor}*PTS[v]`,
          '-map', '[v]',
          '-threads', '1',
          '-filter_threads', '1',
          '-filter_complex_threads', '1',
          '-y', outputName,
        ];
      } else {
        // Custom delay: convert ms per frame to fps
        const targetFps = Math.max(1, Math.min(100, 1000 / customDelay));
        args = [
          '-i', inputName,
          '-r', String(targetFps),
          '-y', outputName,
        ];
      }

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;

      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data], { type: 'image/gif' });
      setOutputGif(blob);

      // Clean up ffmpeg temp files to free memory
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Processing failed:', err);
      if (!abortRef.current) {
        setProcessingError(t('gifSpeed.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsProcessing(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [gifFile, loaded, ffmpeg, speedMode, speedMultiplier, customDelay, t]);

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('gifSpeed.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('gifSpeed.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!gifFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('gifSpeed.uploadPrompt')}
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

          {/* Right: Speed controls panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('gifSpeed.speed')}
            </h2>

            {/* Speed preset buttons */}
            <div>
              <div className="flex flex-wrap gap-2">
                {SPEED_PRESETS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSpeedMultiplier(s); setSpeedMode('preset'); }}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                      speedMode === 'preset' && speedMultiplier === s
                        ? 'bg-purple-600 text-white'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t('gifSpeed.speedMultiplier', { speed: s })}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom delay input */}
            <div>
              <label
                htmlFor="custom-delay"
                className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {t('gifSpeed.customDelay')}
              </label>
              <input
                id="custom-delay"
                type="number"
                min={10}
                max={5000}
                value={customDelay}
                onChange={(e) => {
                  setCustomDelay(Number(e.target.value) || 10);
                  setSpeedMode('custom');
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('gifSpeed.delayMs', { delay: customDelay })}
              </p>
            </div>

            {/* Apply button */}
            <div className="mt-2">
              <button
                onClick={handleApply}
                disabled={isProcessing || !loaded}
                className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('gifSpeed.apply')}
              >
                {isProcessing
                  ? t('gifSpeed.applyProgress', { progress: processProgress })
                  : t('gifSpeed.apply')}
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('gifSpeed.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('gifSpeed.outputSize', { size: formatSize(outputGif.size) })}
            </span>
          </div>
          <Preview file={outputGif} type="image/gif" />
          <WorkflowBar
            file={outputGif}
            fileName="speed-adjusted.gif"
            currentTool="gifSpeed"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

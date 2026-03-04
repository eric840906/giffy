import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Preset resolution option */
type Preset = 'original' | '1080' | '720' | '480' | 'custom';

/**
 * Video Resize page.
 * Upload a video, choose a preset resolution (1080p/720p/480p) or enter
 * custom width/height with aspect ratio lock, and re-encode via ffmpeg.
 *
 * Uses H.264 + AAC encoding with `-vf scale` filter.
 * All processing happens client-side via ffmpeg.wasm.
 */
export function VideoResize() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  /** Hidden video element ref for extracting dimensions */
  const videoRef = useRef<HTMLVideoElement>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');

  // Original video dimensions
  const [originalWidth, setOriginalWidth] = useState<number>(0);
  const [originalHeight, setOriginalHeight] = useState<number>(0);

  // Resize settings
  const [preset, setPreset] = useState<Preset>('original');
  const [customWidth, setCustomWidth] = useState<number>(0);
  const [customHeight, setCustomHeight] = useState<number>(0);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  // Output
  const [outputVideo, setOutputVideo] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  /**
   * Handle video file selection.
   * Creates an object URL for the video player and resets state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setOutputVideo(null);
    setProcessingError(null);
    setPreset('original');
  }, [videoUrl]);

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

  /** Cleanup video URL on unmount and abort in-flight operations */
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      abortRef.current = true;
    };
  }, [videoUrl]);

  /**
   * Extract original video dimensions from hidden video element.
   */
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    setOriginalWidth(w);
    setOriginalHeight(h);
    setCustomWidth(w);
    setCustomHeight(h);
  }, []);

  /**
   * Compute target dimensions for a given preset.
   * Uses `-2` for auto-computed even width with preset height.
   */
  const getPresetDimensions = useCallback((p: Preset): { w: number; h: number } | null => {
    if (p === 'original' || p === 'custom' || !originalWidth || !originalHeight) return null;
    const targetH = Number(p);
    const aspect = originalWidth / originalHeight;
    // Compute width and round to nearest even number
    const targetW = Math.round((targetH * aspect) / 2) * 2;
    return { w: targetW, h: targetH };
  }, [originalWidth, originalHeight]);

  /**
   * Handle preset change — update custom width/height to match.
   */
  const handlePresetChange = useCallback((newPreset: Preset) => {
    setPreset(newPreset);
    if (newPreset === 'original') {
      setCustomWidth(originalWidth);
      setCustomHeight(originalHeight);
    } else if (newPreset !== 'custom') {
      const dims = getPresetDimensions(newPreset);
      if (dims) {
        setCustomWidth(dims.w);
        setCustomHeight(dims.h);
      }
    }
  }, [originalWidth, originalHeight, getPresetDimensions]);

  /**
   * Handle custom width change with optional aspect ratio lock.
   */
  const handleWidthChange = useCallback((w: number) => {
    setCustomWidth(w);
    if (lockAspectRatio && originalWidth && originalHeight && w > 0) {
      const aspect = originalWidth / originalHeight;
      setCustomHeight(Math.round(w / aspect / 2) * 2);
    }
  }, [lockAspectRatio, originalWidth, originalHeight]);

  /**
   * Handle custom height change with optional aspect ratio lock.
   */
  const handleHeightChange = useCallback((h: number) => {
    setCustomHeight(h);
    if (lockAspectRatio && originalWidth && originalHeight && h > 0) {
      const aspect = originalWidth / originalHeight;
      setCustomWidth(Math.round((h * aspect) / 2) * 2);
    }
  }, [lockAspectRatio, originalWidth, originalHeight]);

  /**
   * Resize video using ffmpeg.wasm (H.264 + AAC).
   */
  const handleResize = useCallback(async () => {
    if (!videoFile || !loaded) return;

    abortRef.current = false;
    setIsProcessing(true);
    setProcessProgress(0);
    setOutputVideo(null);
    setProcessingError(null);

    const onProgress = ({ progress }: { progress: number }) => {
      setProcessProgress(Math.round(progress * 100));
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

      // Build ffmpeg arguments
      const args: string[] = ['-i', inputName];

      // Scale filter
      if (preset === 'original') {
        // No scaling, just re-encode
      } else if (preset === 'custom') {
        // Ensure even dimensions
        const w = Math.round(customWidth / 2) * 2;
        const h = Math.round(customHeight / 2) * 2;
        args.push('-vf', `scale=${w}:${h}`);
      } else {
        // Preset: auto-compute width for even value
        args.push('-vf', `scale=-2:${preset}`);
      }

      // H.264 video + AAC audio encoding
      args.push('-c:v', 'libx264');
      args.push('-preset', 'ultrafast');
      args.push('-crf', '23');
      args.push('-c:a', 'aac', '-b:a', '128k');

      // -threads 1 prevents pthread deadlock in ffmpeg.wasm multi-thread build
      // when using scale filter with libx264 encoding
      args.push('-threads', '1');

      args.push('-y', outputName);

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;

      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data], { type: 'video/mp4' });
      setOutputVideo(blob);

      // Clean up ffmpeg temp files to free memory
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Resize failed:', err);
      if (!abortRef.current) {
        setProcessingError(t('videoResize.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
      if (!abortRef.current) {
        setIsProcessing(false);
      }
    }
  }, [videoFile, loaded, ffmpeg, preset, customWidth, customHeight, t]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputVideo(null);
    setProcessingError(null);
  }, []);

  /** Preset options for radio buttons */
  const presetOptions: { value: Preset; label: string }[] = [
    { value: 'original', label: t('videoResize.presetOriginal') },
    { value: '1080', label: '1080p' },
    { value: '720', label: '720p' },
    { value: '480', label: '480p' },
    { value: 'custom', label: t('videoResize.custom') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoResize.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('videoResize.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoResize.uploadPrompt')}
          </p>
          <Upload accept="video/*" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* Hidden video element for extracting dimensions */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedMetadata={handleLoadedMetadata}
          preload="auto"
          className="absolute h-px w-px overflow-hidden opacity-0"
          aria-hidden="true"
        />
      )}

      {/* Editor section: video preview + settings panel */}
      {videoFile && videoUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Video player and original info */}
          <div className="lg:col-span-2">
            <video
              src={videoUrl}
              controls
              className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
              aria-label={t('videoResize.title')}
            />
            {/* Original file info */}
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 px-4 py-2 dark:bg-gray-800">
              {originalWidth > 0 && originalHeight > 0 && (
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {t('videoResize.originalSize', { width: originalWidth, height: originalHeight })}
                </span>
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {formatSize(videoFile.size)}
              </span>
            </div>
          </div>

          {/* Right: Settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            {/* Preset resolution radio buttons */}
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
                      className="accent-purple-600"
                    />
                    <span className="text-gray-700 dark:text-gray-200">
                      {opt.label}
                      {opt.value !== 'original' && opt.value !== 'custom' && originalWidth > 0 && (
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
                  <label
                    htmlFor="custom-width"
                    className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
                  >
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
                  <label
                    htmlFor="custom-height"
                    className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
                  >
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
                    className="accent-purple-600"
                  />
                  {t('videoResize.lockAspectRatio')}
                </label>
              </div>
            )}

            {/* Resize button */}
            <div className="mt-2">
              <button
                onClick={handleResize}
                disabled={isProcessing || !loaded}
                className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('videoResize.resize')}
              >
                {isProcessing
                  ? t('videoResize.resizeProgress', { progress: processProgress })
                  : t('videoResize.resize')}
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
      {outputVideo && !isProcessing && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoResize.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('videoResize.outputSize', { size: formatSize(outputVideo.size) })}
            </span>
          </div>
          <Preview file={outputVideo} type="video/mp4" />
          <WorkflowBar
            file={outputVideo}
            fileName="resized.mp4"
            currentTool="videoResize"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

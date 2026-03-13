import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { TimeRangeSlider } from '../../components/TimeRangeSlider/TimeRangeSlider';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Default conversion settings */
const DEFAULTS = {
  width: 480,
  fps: 10,
  quality: 75,
};

/**
 * Map quality (1-100) to color count (16-256) for palette-based GIF generation.
 * @param q - Quality value from 1 to 100
 * @returns Number of colors for the palette (16-256)
 */
function qualityToColorCount(q: number): number {
  return Math.round(16 + (q / 100) * (256 - 16));
}

/**
 * Video to GIF conversion page.
 * Upload video -> select time range -> configure settings -> preview/convert -> download.
 *
 * All processing happens client-side via ffmpeg.wasm.
 */
export function VideoToGif() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();
  const videoRef = useRef<HTMLVideoElement>(null);

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState(0);

  // Time range
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  // Settings
  const [width, setWidth] = useState(DEFAULTS.width);
  const [fps, setFps] = useState(DEFAULTS.fps);
  const [quality, setQuality] = useState(DEFAULTS.quality);

  // Output
  const [outputGif, setOutputGif] = useState<Blob | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [conversionError, setConversionError] = useState<string | null>(null);

  /**
   * Handle video file selection.
   * Creates an object URL for the video player and resets conversion state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setOutputGif(null);
    setStartTime(0);
    setConversionError(null);
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
   * Get video duration after metadata loads.
   * Sets end time to full duration so the entire video is selected by default.
   */
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setVideoDuration(dur);
      setEndTime(dur);
    }
  }, []);

  /** Handle time range change from the slider */
  const handleTimeRangeChange = useCallback((start: number, end: number) => {
    setStartTime(start);
    setEndTime(end);
    if (videoRef.current) {
      videoRef.current.currentTime = start;
    }
  }, []);

  /**
   * Convert video to GIF using ffmpeg.wasm with a two-pass palette approach.
   * Pass 1 generates an optimized palette; pass 2 uses it for the final GIF.
   * @param isPreview - If true, generates a lower-resolution preview for speed
   */
  const handleConvert = useCallback(async (isPreview = false) => {
    if (!videoFile || !loaded || endTime <= startTime) return;

    abortRef.current = false;
    setIsConverting(true);
    setConvertProgress(0);
    setOutputGif(null);
    setConversionError(null);

    const onProgress = ({ progress }: { progress: number }) => {
      setConvertProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      const ext = videoFile.name?.includes('.') ? videoFile.name.substring(videoFile.name.lastIndexOf('.')) : '.mp4';
      const inputName = 'input' + ext;
      const outputName = 'output.gif';
      const paletteName = 'palette.png';

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      const duration = endTime - startTime;
      const outputWidth = isPreview ? Math.min(width, 320) : width;
      const outputFps = isPreview ? Math.min(fps, 8) : fps;
      const colorCount = qualityToColorCount(quality);
      const vf = `fps=${outputFps},scale=${outputWidth}:-1:flags=lanczos`;

      // Two-pass palette approach for high-quality GIF output
      // Note: -threads 1 / -filter_threads 1 / -filter_complex_threads 1 are required
      // to prevent pthread deadlocks in the ffmpeg.wasm multi-thread build (core-mt).
      let ret: number;

      // Pass 1: generate optimized palette
      ret = await ffmpeg.exec([
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-i', inputName,
        '-vf', `${vf},palettegen=max_colors=${colorCount}`,
        '-threads', '1',
        '-y', paletteName,
      ]);
      if (abortRef.current) return;

      if (ret === 0) {
        // Pass 2: apply palette for dither-free GIF
        ret = await ffmpeg.exec([
          '-ss', startTime.toString(),
          '-t', duration.toString(),
          '-i', inputName,
          '-i', paletteName,
          '-filter_complex', `[0:v]${vf}[x];[x][1:v]paletteuse`,
          '-threads', '1',
          '-filter_threads', '1',
          '-filter_complex_threads', '1',
          '-y', outputName,
        ]);
        if (abortRef.current) return;
      }

      // Fallback to single-pass if palette approach failed
      if (ret !== 0) {
        ret = await ffmpeg.exec([
          '-ss', startTime.toString(),
          '-t', duration.toString(),
          '-i', inputName,
          '-vf', vf,
          '-y', outputName,
        ]);
        if (abortRef.current) return;
        if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);
      }

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'image/gif' });
      setOutputGif(blob);

      // Clean up ffmpeg temp files to free memory
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
      try { await ffmpeg.deleteFile(paletteName); } catch { /* may not exist */ }
    } catch (err) {
      console.error('Conversion failed:', err);
      if (!abortRef.current) {
        setConversionError(t('videoToGif.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsConverting(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [videoFile, loaded, ffmpeg, startTime, endTime, width, fps, quality, t]);

  /**
   * Reset file selection and return to the upload view.
   * Revokes all object URLs and clears output/error state.
   */
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl('');
    setOutputGif(null);
    setConversionError(null);
    setStartTime(0);
    setEndTime(0);
    setVideoDuration(0);
  }, [videoUrl]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputGif(null);
    setConversionError(null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoToGif.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-mint-50 p-4 text-center text-sm text-mint-600 dark:bg-mint-950/20 dark:text-mint-400">
          {ffmpegError || t('videoToGif.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoToGif.uploadPrompt')}
          </p>
          <Upload accept="video/*" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* File info bar with change file button */}
      {videoFile && (
        <div className="flex items-center justify-between rounded-xl bg-gray-100 px-4 py-2 dark:bg-gray-800">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
              {videoFile.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {formatSize(videoFile.size)}
            </span>
          </div>
          <button
            onClick={handleReset}
            disabled={isConverting}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('upload.changeFile')}
          </button>
        </div>
      )}

      {/* Editor section */}
      {videoFile && videoUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Video player + time range */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
              aria-label={t('videoToGif.title')}
            />

            {videoDuration > 0 && (
              <TimeRangeSlider
                duration={videoDuration}
                start={startTime}
                end={endTime}
                onChange={handleTimeRangeChange}
              />
            )}
          </div>

          {/* Right: Settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoToGif.settings')}
            </h2>

            {/* Width */}
            <div>
              <label htmlFor="gif-width" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('videoToGif.width')}
              </label>
              <input
                id="gif-width"
                type="number"
                min={100}
                max={1920}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value) || DEFAULTS.width)}
                onBlur={() => setWidth(Math.max(100, Math.min(1920, width)))}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            {/* FPS */}
            <div>
              <label htmlFor="gif-fps" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('videoToGif.fps')}: {fps}
              </label>
              <input
                id="gif-fps"
                type="range"
                min={5}
                max={30}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full accent-mint-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>5</span>
                <span>30</span>
              </div>
            </div>

            {/* Quality */}
            <div>
              <label htmlFor="gif-quality" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('videoToGif.quality')}: {quality}
              </label>
              <input
                id="gif-quality"
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-mint-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1</span>
                <span>100</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-2 flex flex-col gap-2">
              <button
                onClick={() => handleConvert(true)}
                disabled={isConverting || !loaded || endTime <= startTime}
                className="w-full rounded-xl border border-mint-300 px-4 py-2 text-sm font-medium text-mint-600 transition-colors hover:bg-mint-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-mint-700 dark:text-mint-400 dark:hover:bg-mint-950/20"
                aria-label={t('videoToGif.preview')}
              >
                {t('videoToGif.preview')}
              </button>
              <button
                onClick={() => handleConvert(false)}
                disabled={isConverting || !loaded || endTime <= startTime}
                className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('videoToGif.convert')}
              >
                {isConverting
                  ? t('videoToGif.convertProgress', { progress: convertProgress })
                  : t('videoToGif.convert')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conversion error alert */}
      {conversionError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {conversionError}
        </div>
      )}

      {/* Converting progress bar */}
      {isConverting && (
        <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-mint-600 transition-all"
            style={{ width: `${convertProgress}%` }}
            role="progressbar"
            aria-valuenow={convertProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Output section */}
      {outputGif && !isConverting && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoToGif.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('videoToGif.outputSize', { size: formatSize(outputGif.size) })}
            </span>
          </div>
          <Preview file={outputGif} type="image/gif" />
          <WorkflowBar
            file={outputGif}
            fileName="output.gif"
            currentTool="videoToGif"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

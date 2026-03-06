import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Filter state for all adjustable parameters */
interface FilterState {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  sepia: boolean;
  blur: number;
  sharpen: number;
  invert: boolean;
}

/** Default filter values (no effect) */
const DEFAULT_FILTERS: FilterState = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  grayscale: false,
  sepia: false,
  blur: 0,
  sharpen: 0,
  invert: false,
};

/**
 * Build a CSS `filter` string from filter state for live preview.
 * Sharpen has no CSS equivalent and is omitted.
 */
function buildCssFilter(f: FilterState): string {
  const parts: string[] = [];
  if (f.brightness !== 0) parts.push(`brightness(${1 + f.brightness})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
  if (f.grayscale) parts.push('grayscale(1)');
  if (f.sepia) parts.push('sepia(1)');
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.invert) parts.push('invert(1)');
  return parts.join(' ') || 'none';
}

/**
 * Build an ffmpeg `-vf` filter chain string from filter state.
 * Returns null if no filters are active.
 */
function buildFfmpegVf(f: FilterState): string | null {
  const parts: string[] = [];

  // eq filter combines brightness, contrast, saturation
  const eqParts: string[] = [];
  if (f.brightness !== 0) eqParts.push(`brightness=${f.brightness}`);
  if (f.contrast !== 1) eqParts.push(`contrast=${f.contrast}`);
  if (f.saturation !== 1) eqParts.push(`saturation=${f.saturation}`);
  if (eqParts.length > 0) parts.push(`eq=${eqParts.join(':')}`);

  if (f.grayscale) parts.push('hue=s=0');
  if (f.sepia) parts.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0');
  if (f.blur > 0) parts.push(`boxblur=${f.blur}:1`);
  if (f.sharpen > 0) parts.push(`unsharp=5:5:${f.sharpen}:5:5:${f.sharpen}`);
  if (f.invert) parts.push('negate');

  return parts.length > 0 ? parts.join(',') : null;
}

/**
 * Check whether any filter differs from its default value.
 */
function hasActiveFilters(f: FilterState): boolean {
  return f.brightness !== 0 || f.contrast !== 1 || f.saturation !== 1 ||
    f.grayscale || f.sepia || f.blur > 0 || f.sharpen > 0 || f.invert;
}

/**
 * Video Filter page.
 * Upload a video, adjust filter parameters via sliders/toggles,
 * see a live CSS-based preview, then apply filters via ffmpeg.
 *
 * All processing happens client-side via ffmpeg.wasm.
 */
export function VideoFilter() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');

  // Filter state
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });

  // Output
  const [outputVideo, setOutputVideo] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  /** CSS filter string for live preview */
  const cssFilter = useMemo(() => buildCssFilter(filters), [filters]);

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
    setFilters({ ...DEFAULT_FILTERS });
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
   * Apply filters to the video using ffmpeg.wasm.
   * Encodes with H.264 + AAC, uses -threads 1 to prevent deadlock.
   */
  const handleApply = useCallback(async () => {
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

    const ext = videoFile.name?.includes('.')
      ? videoFile.name.substring(videoFile.name.lastIndexOf('.'))
      : '.mp4';
    const inputName = `input${ext}`;
    const outputName = 'filtered.mp4';

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      const args: string[] = ['-i', inputName];

      // Add video filter chain if any filters are active
      const vf = buildFfmpegVf(filters);
      if (vf) {
        args.push('-vf', vf);
      }

      // H.264 video + AAC audio encoding
      args.push('-c:v', 'libx264');
      args.push('-preset', 'ultrafast');
      args.push('-crf', '23');
      args.push('-c:a', 'aac', '-b:a', '128k');

      // -threads 1 prevents pthread deadlock in ffmpeg.wasm multi-thread build
      // when using -vf filters with libx264 encoding
      args.push('-threads', '1');

      args.push('-y', outputName);

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;

      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data], { type: 'video/mp4' });
      setOutputVideo(blob);
    } catch (err) {
      console.error('Filter apply failed:', err);
      if (!abortRef.current) {
        setProcessingError(t('videoFilter.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
      // Clean up ffmpeg temp files to free memory (even on error/abort)
      try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
      if (!abortRef.current) {
        setIsProcessing(false);
      }
    }
  }, [videoFile, loaded, ffmpeg, filters, t]);

  /**
   * Reset file selection and return to the upload view.
   */
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl('');
    setOutputVideo(null);
    setProcessingError(null);
    setFilters({ ...DEFAULT_FILTERS });
  }, [videoUrl]);

  /** Reset all filters to defaults */
  const handleResetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputVideo(null);
    setProcessingError(null);
  }, []);

  /** Update a single filter value */
  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoFilter.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('videoFilter.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoFilter.uploadPrompt')}
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
            disabled={isProcessing}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('upload.changeFile')}
          </button>
        </div>
      )}

      {/* Editor section: video preview + filter controls */}
      {videoFile && videoUrl && !outputVideo && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Video player with CSS filter preview */}
          <div className="lg:col-span-2">
            <video
              src={videoUrl}
              controls
              style={{ filter: cssFilter }}
              className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
              aria-label={t('videoFilter.title')}
            />
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 px-4 py-2 dark:bg-gray-800">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {formatSize(videoFile.size)}
              </span>
            </div>
          </div>

          {/* Right: Filter settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoFilter.settings')}
            </h2>

            {/* Brightness slider */}
            <div>
              <label htmlFor="filter-brightness" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                <span>{t('videoFilter.brightness')}</span>
                <span className="text-xs text-gray-400">{filters.brightness.toFixed(1)}</span>
              </label>
              <input
                id="filter-brightness"
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={filters.brightness}
                onChange={(e) => updateFilter('brightness', Number(e.target.value))}
                className="w-full accent-purple-600"
              />
            </div>

            {/* Contrast slider */}
            <div>
              <label htmlFor="filter-contrast" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                <span>{t('videoFilter.contrast')}</span>
                <span className="text-xs text-gray-400">{filters.contrast.toFixed(1)}</span>
              </label>
              <input
                id="filter-contrast"
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={filters.contrast}
                onChange={(e) => updateFilter('contrast', Number(e.target.value))}
                className="w-full accent-purple-600"
              />
            </div>

            {/* Saturation slider */}
            <div>
              <label htmlFor="filter-saturation" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                <span>{t('videoFilter.saturation')}</span>
                <span className="text-xs text-gray-400">{filters.saturation.toFixed(1)}</span>
              </label>
              <input
                id="filter-saturation"
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={filters.saturation}
                onChange={(e) => updateFilter('saturation', Number(e.target.value))}
                className="w-full accent-purple-600"
              />
            </div>

            {/* Grayscale toggle */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={filters.grayscale}
                onChange={(e) => updateFilter('grayscale', e.target.checked)}
                className="accent-purple-600"
              />
              {t('videoFilter.grayscale')}
            </label>

            {/* Sepia toggle */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={filters.sepia}
                onChange={(e) => updateFilter('sepia', e.target.checked)}
                className="accent-purple-600"
              />
              {t('videoFilter.sepia')}
            </label>

            {/* Blur slider */}
            <div>
              <label htmlFor="filter-blur" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                <span>{t('videoFilter.blur')}</span>
                <span className="text-xs text-gray-400">{filters.blur}</span>
              </label>
              <input
                id="filter-blur"
                type="range"
                min={0}
                max={20}
                step={1}
                value={filters.blur}
                onChange={(e) => updateFilter('blur', Number(e.target.value))}
                className="w-full accent-purple-600"
              />
            </div>

            {/* Sharpen slider */}
            <div>
              <label htmlFor="filter-sharpen" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                <span>
                  {t('videoFilter.sharpen')}
                  <span className="ml-1 text-xs text-gray-400">{t('videoFilter.sharpenNote')}</span>
                </span>
                <span className="text-xs text-gray-400">{filters.sharpen.toFixed(1)}</span>
              </label>
              <input
                id="filter-sharpen"
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={filters.sharpen}
                onChange={(e) => updateFilter('sharpen', Number(e.target.value))}
                className="w-full accent-purple-600"
              />
            </div>

            {/* Invert toggle */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={filters.invert}
                onChange={(e) => updateFilter('invert', e.target.checked)}
                className="accent-purple-600"
              />
              {t('videoFilter.invert')}
            </label>

            {/* Reset + Apply buttons */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleResetFilters}
                disabled={isProcessing}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t('videoFilter.reset')}
              </button>
              <button
                onClick={handleApply}
                disabled={isProcessing || !loaded || !hasActiveFilters(filters)}
                className="flex-1 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('videoFilter.apply')}
              >
                {isProcessing
                  ? t('videoFilter.applyProgress', { progress: processProgress })
                  : t('videoFilter.apply')}
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
            aria-label={t('videoFilter.applyProgress', { progress: processProgress })}
          />
        </div>
      )}

      {/* Output section */}
      {outputVideo && !isProcessing && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoFilter.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('videoFilter.outputSize', { size: formatSize(outputVideo.size) })}
            </span>
          </div>
          <Preview file={outputVideo} type="video/mp4" />
          <WorkflowBar
            file={outputVideo}
            fileName="filtered.mp4"
            currentTool="videoFilter"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

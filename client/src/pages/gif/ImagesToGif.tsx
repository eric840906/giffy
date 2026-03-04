import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { ImageSequence } from '../../components/ImageSequence/ImageSequence';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Default conversion settings */
const DEFAULTS = {
  delay: 200,
  width: 480,
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
 * Images to GIF composition page.
 * Upload multiple images -> reorder -> configure settings -> preview/generate -> download.
 *
 * All processing happens client-side via ffmpeg.wasm.
 */
export function ImagesToGif() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  /** Ref to hold the preview animation interval */
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Image state
  const [images, setImages] = useState<File[]>([]);

  // Settings
  const [delay, setDelay] = useState(DEFAULTS.delay);
  const [width, setWidth] = useState(DEFAULTS.width);
  const [quality, setQuality] = useState(DEFAULTS.quality);

  // Output
  const [outputGif, setOutputGif] = useState<Blob | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [conversionError, setConversionError] = useState<string | null>(null);

  // CSS preview
  const [previewActive, setPreviewActive] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  /**
   * Object URL for the current CSS preview frame.
   * Creates and revokes URLs to avoid memory leaks.
   */
  const previewUrl = useMemo(() => {
    if (!previewActive || images.length === 0 || previewIndex >= images.length) return '';
    return URL.createObjectURL(images[previewIndex]);
  }, [previewActive, previewIndex, images]);

  /** Revoke previous preview object URL when it changes */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /**
   * Handle image file selection from the initial upload.
   * Sets images and resets conversion state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    if (!files.length) return;
    setImages(files);
    setOutputGif(null);
    setConversionError(null);
  }, []);

  /**
   * Handle additional image files being added.
   * Appends to the existing images array.
   */
  const handleAddMore = useCallback((files: File[]) => {
    if (!files.length) return;
    setImages((prev) => [...prev, ...files]);
    setOutputGif(null);
  }, []);

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
      if (state.file.type.startsWith('image/')) {
        setImages([state.file]);
      }
    }
  }, [location.state]);

  /** Cleanup on unmount: abort operations and clear preview timer */
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (previewTimerRef.current) {
        clearInterval(previewTimerRef.current);
      }
    };
  }, []);

  /**
   * Start CSS preview animation.
   * Cycles through images at the configured delay interval.
   */
  const handlePreview = useCallback(() => {
    setPreviewActive(true);
    setPreviewIndex(0);
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
    previewTimerRef.current = setInterval(() => {
      setPreviewIndex((prev) => (prev + 1) % images.length);
    }, delay);
  }, [images.length, delay]);

  /**
   * Stop CSS preview animation and clear the timer.
   */
  const stopPreview = useCallback(() => {
    setPreviewActive(false);
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  /**
   * Remove a single image from the sequence by index.
   * Stops preview to prevent out-of-bounds index access.
   */
  const handleRemove = useCallback((index: number) => {
    stopPreview();
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, [stopPreview]);

  /**
   * Generate GIF from images using ffmpeg.wasm with a two-pass palette approach.
   * Uses concat demuxer for frame sequencing with configurable delay.
   */
  const handleGenerate = useCallback(async () => {
    if (!images.length || !loaded) return;

    abortRef.current = false;
    stopPreview();
    setIsConverting(true);
    setConvertProgress(0);
    setOutputGif(null);
    setConversionError(null);

    const onProgress = ({ progress }: { progress: number }) => {
      setConvertProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      // Write each image as frame_001.png, frame_002.png, etc.
      for (let i = 0; i < images.length; i++) {
        const name = `frame_${String(i + 1).padStart(3, '0')}.png`;
        await ffmpeg.writeFile(name, await fetchFile(images[i]));
        if (abortRef.current) return;
      }

      // Write concat demuxer file list
      const delaySeconds = (delay / 1000).toFixed(3);
      let listContent = '';
      for (let i = 0; i < images.length; i++) {
        const name = `frame_${String(i + 1).padStart(3, '0')}.png`;
        listContent += `file '${name}'\nduration ${delaySeconds}\n`;
      }
      // Repeat last frame (concat demuxer requirement for proper last-frame duration)
      const lastName = `frame_${String(images.length).padStart(3, '0')}.png`;
      listContent += `file '${lastName}'\n`;

      await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listContent));
      if (abortRef.current) return;

      // Two-pass palette approach for high-quality GIF output
      const colorCount = qualityToColorCount(quality);
      const vf = `scale=${width}:-1:flags=lanczos`;

      // Pass 1: generate optimized palette
      // Note: -threads 1 prevents pthread deadlocks in ffmpeg.wasm multi-thread build
      let ret = await ffmpeg.exec([
        '-f', 'concat', '-safe', '0', '-i', 'list.txt',
        '-vf', `${vf},palettegen=max_colors=${colorCount}`,
        '-threads', '1',
        '-y', 'palette.png',
      ]);
      if (abortRef.current) return;

      if (ret === 0) {
        // Pass 2: apply palette for dither-free GIF
        ret = await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'list.txt',
          '-i', 'palette.png',
          '-filter_complex', `[0:v]${vf}[x];[x][1:v]paletteuse`,
          '-threads', '1',
          '-filter_threads', '1',
          '-filter_complex_threads', '1',
          '-y', 'output.gif',
        ]);
        if (abortRef.current) return;
      }

      // Fallback to single-pass if palette approach failed
      if (ret !== 0) {
        ret = await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'list.txt',
          '-vf', vf,
          '-y', 'output.gif',
        ]);
        if (abortRef.current) return;
        if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);
      }

      const data = await ffmpeg.readFile('output.gif');
      if (abortRef.current) return;

      const blob = new Blob([data], { type: 'image/gif' });
      setOutputGif(blob);
    } catch (err) {
      console.error('Generation failed:', err);
      if (!abortRef.current) {
        setConversionError(t('imagesToGif.error'));
      }
    } finally {
      // Clean up ffmpeg temp files to free memory (always runs, even on abort)
      for (let i = 0; i < images.length; i++) {
        const name = `frame_${String(i + 1).padStart(3, '0')}.png`;
        try { await ffmpeg.deleteFile(name); } catch { /* may not exist */ }
      }
      try { await ffmpeg.deleteFile('list.txt'); } catch { /* may not exist */ }
      try { await ffmpeg.deleteFile('output.gif'); } catch { /* may not exist */ }
      try { await ffmpeg.deleteFile('palette.png'); } catch { /* may not exist */ }

      if (!abortRef.current) {
        setIsConverting(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [images, loaded, ffmpeg, delay, width, quality, stopPreview, t]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputGif(null);
    setConversionError(null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('imagesToGif.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('imagesToGif.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {images.length === 0 && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('imagesToGif.uploadPrompt')}
          </p>
          <Upload accept="image/*" multiple onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* Editor section */}
      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: ImageSequence + preview + add more */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <ImageSequence
              images={images}
              onReorder={setImages}
              onRemove={handleRemove}
            />

            {/* CSS preview area */}
            {previewActive && previewUrl && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <img
                  src={previewUrl}
                  alt={t('imagesToGif.preview')}
                  className="max-h-64 max-w-full rounded-xl object-contain"
                />
                <button
                  onClick={stopPreview}
                  className="rounded-xl border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/20"
                  aria-label={t('imagesToGif.stopPreview')}
                >
                  {t('imagesToGif.stopPreview')}
                </button>
              </div>
            )}

            {/* Add more images */}
            <Upload accept="image/*" multiple onFileSelect={handleAddMore} />
          </div>

          {/* Right: Settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('imagesToGif.settings')}
            </h2>

            {/* Delay */}
            <div>
              <label htmlFor="gif-delay" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('imagesToGif.delay')}: {t('imagesToGif.delayMs', { delay })}
              </label>
              <input
                id="gif-delay"
                type="range"
                min={50}
                max={2000}
                step={50}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
                className="w-full accent-purple-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>50ms</span>
                <span>2000ms</span>
              </div>
            </div>

            {/* Width */}
            <div>
              <label htmlFor="gif-width" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('imagesToGif.width')}
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

            {/* Quality */}
            <div>
              <label htmlFor="gif-quality" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('imagesToGif.quality')}: {quality}
              </label>
              <input
                id="gif-quality"
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-purple-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1</span>
                <span>100</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-2 flex flex-col gap-2">
              <button
                onClick={previewActive ? stopPreview : handlePreview}
                disabled={isConverting || images.length === 0}
                className="w-full rounded-xl border border-purple-300 px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/20"
                aria-label={previewActive ? t('imagesToGif.stopPreview') : t('imagesToGif.preview')}
              >
                {previewActive ? t('imagesToGif.stopPreview') : t('imagesToGif.preview')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={isConverting || !loaded || images.length === 0}
                className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('imagesToGif.generate')}
              >
                {isConverting
                  ? t('imagesToGif.generateProgress', { progress: convertProgress })
                  : t('imagesToGif.generate')}
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
            className="h-2 rounded-full bg-purple-600 transition-all"
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
              {t('imagesToGif.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('imagesToGif.outputSize', { size: formatSize(outputGif.size) })}
            </span>
          </div>
          <Preview file={outputGif} type="image/gif" />
          <WorkflowBar
            file={outputGif}
            fileName="animation.gif"
            currentTool="imagesToGif"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

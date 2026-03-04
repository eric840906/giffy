import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { CropOverlay } from '../../components/CropOverlay/CropOverlay';
import type { CropRect } from '../../components/CropOverlay/CropOverlay';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/**
 * GIF Crop/Resize page.
 * Upload a GIF -> crop area selection -> resize settings -> apply -> download.
 *
 * All processing happens client-side via ffmpeg.wasm.
 */
export function GifCropResize() {
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

  // Image dimensions (natural)
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);

  // Crop rectangle (in image coordinates)
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });

  // Resize output dimensions
  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);

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
    setImageWidth(0);
    setImageHeight(0);
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
   * Handle hidden image load to read natural dimensions.
   * Sets initial crop to full image and output dimensions to natural size.
   */
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setImageWidth(w);
    setImageHeight(h);
    setCrop({ x: 0, y: 0, width: w, height: h });
    setOutputWidth(w);
    setOutputHeight(h);
  }, []);

  /**
   * Handle crop rectangle change from CropOverlay.
   * Updates output dimensions to match crop area.
   */
  const handleCropChange = useCallback((newCrop: CropRect) => {
    setCrop(newCrop);
    const cropW = Math.round(newCrop.width);
    const cropH = Math.round(newCrop.height);
    setOutputWidth(cropW);
    setOutputHeight(cropH);
  }, []);

  /** Reset crop to full image */
  const handleResetCrop = useCallback(() => {
    if (imageWidth > 0 && imageHeight > 0) {
      setCrop({ x: 0, y: 0, width: imageWidth, height: imageHeight });
      setOutputWidth(imageWidth);
      setOutputHeight(imageHeight);
    }
  }, [imageWidth, imageHeight]);

  /**
   * Handle output width change.
   * When aspect ratio is locked, auto-updates height proportionally.
   */
  const handleWidthChange = useCallback((newWidth: number) => {
    setOutputWidth(newWidth);
    if (lockAspect && crop.height > 0) {
      const aspectRatio = crop.width / crop.height;
      setOutputHeight(Math.round(newWidth / aspectRatio));
    }
  }, [lockAspect, crop.width, crop.height]);

  /**
   * Handle output height change.
   * When aspect ratio is locked, auto-updates width proportionally.
   */
  const handleHeightChange = useCallback((newHeight: number) => {
    setOutputHeight(newHeight);
    if (lockAspect && crop.width > 0) {
      const aspectRatio = crop.width / crop.height;
      setOutputWidth(Math.round(newHeight * aspectRatio));
    }
  }, [lockAspect, crop.width, crop.height]);

  /**
   * Apply crop and resize using ffmpeg.wasm.
   * Builds a video filter string for crop (if not full image) and scale.
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

      // Build video filter: crop (if not full image) + scale
      const isFullImage =
        Math.round(crop.x) === 0 &&
        Math.round(crop.y) === 0 &&
        Math.round(crop.width) === imageWidth &&
        Math.round(crop.height) === imageHeight;

      const safeOutputW = Math.max(1, Math.round(outputWidth));
      const safeOutputH = Math.max(1, Math.round(outputHeight));

      let vf: string;
      if (isFullImage) {
        vf = `scale=${safeOutputW}:${safeOutputH}:flags=lanczos`;
      } else {
        vf = `crop=${Math.round(crop.width)}:${Math.round(crop.height)}:${Math.round(crop.x)}:${Math.round(crop.y)},scale=${safeOutputW}:${safeOutputH}:flags=lanczos`;
      }

      const ret = await ffmpeg.exec([
        '-i', inputName,
        '-vf', vf,
        '-y', outputName,
      ]);
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
        setProcessingError(t('gifCropResize.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsProcessing(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [gifFile, loaded, ffmpeg, crop, imageWidth, imageHeight, outputWidth, outputHeight, t]);

  /**
   * Reset file selection and return to the upload view.
   * Revokes all object URLs and clears output/error/crop state.
   */
  const handleReset = useCallback(() => {
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    setGifFile(null);
    setGifUrl('');
    setOutputGif(null);
    setProcessingError(null);
    setImageWidth(0);
    setImageHeight(0);
    setCrop({ x: 0, y: 0, width: 0, height: 0 });
    setOutputWidth(0);
    setOutputHeight(0);
  }, [gifUrl]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputGif(null);
    setProcessingError(null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('gifCropResize.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('gifCropResize.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!gifFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('gifCropResize.uploadPrompt')}
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

      {/* Hidden image to get natural dimensions */}
      {gifFile && gifUrl && (
        <img
          src={gifUrl}
          alt=""
          className="hidden"
          onLoad={handleImageLoad}
        />
      )}

      {/* Editor section */}
      {gifFile && gifUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: CropOverlay or loading placeholder */}
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
              {t('gifCropResize.settings')}
            </h2>

            {/* Crop area display */}
            <div>
              <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('gifCropResize.crop')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(crop.x)}, {Math.round(crop.y)} - {Math.round(crop.width)} x {Math.round(crop.height)}
              </p>
              <button
                onClick={handleResetCrop}
                className="mt-2 rounded-xl border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label={t('gifCropResize.resetCrop')}
              >
                {t('gifCropResize.resetCrop')}
              </button>
            </div>

            {/* Resize section */}
            <div>
              <p className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('gifCropResize.resize')}
              </p>

              {/* Width */}
              <div className="mb-2">
                <label htmlFor="resize-width" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                  {t('gifCropResize.width')}
                </label>
                <input
                  id="resize-width"
                  type="number"
                  min={1}
                  max={4096}
                  value={outputWidth}
                  onChange={(e) => handleWidthChange(Number(e.target.value) || 1)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {/* Height */}
              <div className="mb-2">
                <label htmlFor="resize-height" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                  {t('gifCropResize.height')}
                </label>
                <input
                  id="resize-height"
                  type="number"
                  min={1}
                  max={4096}
                  value={outputHeight}
                  onChange={(e) => handleHeightChange(Number(e.target.value) || 1)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>

              {/* Lock aspect ratio toggle */}
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={lockAspect}
                  onChange={(e) => setLockAspect(e.target.checked)}
                  className="rounded accent-purple-600"
                />
                {t('gifCropResize.lockAspectRatio')}
              </label>
            </div>

            {/* Apply button */}
            <div className="mt-2">
              <button
                onClick={handleApply}
                disabled={isProcessing || !loaded || imageWidth === 0}
                className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('gifCropResize.apply')}
              >
                {isProcessing
                  ? t('gifCropResize.applyProgress', { progress: processProgress })
                  : t('gifCropResize.apply')}
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
              {t('gifCropResize.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('gifCropResize.outputSize', { size: formatSize(outputGif.size) })}
            </span>
          </div>
          <Preview file={outputGif} type="image/gif" />
          <WorkflowBar
            file={outputGif}
            fileName="cropped.gif"
            currentTool="gifCropResize"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

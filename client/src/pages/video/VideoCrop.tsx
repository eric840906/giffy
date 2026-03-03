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
 * Video Crop (area) page.
 * Upload a video -> extract first frame -> drag to select crop area -> apply ffmpeg crop filter.
 *
 * Uses a hidden <video> + <canvas> to extract the first frame as a data URL,
 * then displays it with CropOverlay for area selection.
 * All processing happens client-side via ffmpeg.wasm.
 */
export function VideoCrop() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Hidden video element ref for frame extraction */
  const videoRef = useRef<HTMLVideoElement>(null);

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');

  // Frame extraction state
  const [frameUrl, setFrameUrl] = useState<string>('');
  const [frameWidth, setFrameWidth] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);

  // Crop rectangle (in image/frame coordinates)
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });

  // Output
  const [outputVideo, setOutputVideo] = useState<Blob | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropProgress, setCropProgress] = useState(0);
  const [cropError, setCropError] = useState<string | null>(null);

  /**
   * Handle video file selection.
   * Creates an object URL for the hidden video player and resets all state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setOutputVideo(null);
    setCropError(null);
    setFrameUrl('');
    setFrameWidth(0);
    setFrameHeight(0);
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
   * Extract the first frame from the loaded video.
   * Draws the video to an offscreen canvas and converts to a data URL.
   * Sets frameWidth/frameHeight from the video's natural dimensions and
   * initialises the crop rectangle to the full frame.
   */
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth;
    const h = video.videoHeight;

    if (w === 0 || h === 0) return;

    // Draw the first frame to an offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/png');

    setFrameUrl(dataUrl);
    setFrameWidth(w);
    setFrameHeight(h);
    setCrop({ x: 0, y: 0, width: w, height: h });
  }, []);

  /**
   * Handle crop rectangle change from CropOverlay.
   */
  const handleCropChange = useCallback((newCrop: CropRect) => {
    setCrop(newCrop);
  }, []);

  /** Reset crop to full frame */
  const handleResetCrop = useCallback(() => {
    if (frameWidth > 0 && frameHeight > 0) {
      setCrop({ x: 0, y: 0, width: frameWidth, height: frameHeight });
    }
  }, [frameWidth, frameHeight]);

  /**
   * Apply crop using ffmpeg.wasm.
   * Uses the -vf "crop=W:H:X:Y" filter to crop the video frame area.
   */
  const handleCrop = useCallback(async () => {
    if (!videoFile || !loaded) return;

    abortRef.current = false;
    setIsCropping(true);
    setCropProgress(0);
    setOutputVideo(null);
    setCropError(null);

    /** Progress listener for ffmpeg */
    const onProgress = ({ progress }: { progress: number }) => {
      setCropProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      const ext = videoFile.name.substring(videoFile.name.lastIndexOf('.'));
      const inputName = 'input' + ext;
      const outputName = 'cropped.mp4';

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      const cropW = Math.round(crop.width);
      const cropH = Math.round(crop.height);
      const cropX = Math.round(crop.x);
      const cropY = Math.round(crop.y);

      const ret = await ffmpeg.exec([
        '-i', inputName,
        '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
        '-y', outputName,
      ]);
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
      console.error('Crop failed:', err);
      if (!abortRef.current) {
        setCropError(t('videoCrop.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsCropping(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [videoFile, loaded, ffmpeg, crop, t]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputVideo(null);
    setCropError(null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoCrop.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('videoCrop.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoCrop.uploadPrompt')}
          </p>
          <Upload accept="video/*" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* Hidden video element for frame extraction */}
      {videoFile && videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedData={handleVideoLoaded}
          className="hidden"
          muted
          playsInline
          aria-hidden="true"
        />
      )}

      {/* Editor section: CropOverlay + settings panel */}
      {videoFile && videoUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: CropOverlay or loading placeholder */}
          <div className="lg:col-span-2">
            {frameWidth > 0 && frameHeight > 0 ? (
              <>
                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                  {t('videoCrop.cropHint')}
                </p>
                <CropOverlay
                  src={frameUrl}
                  imageWidth={frameWidth}
                  imageHeight={frameHeight}
                  crop={crop}
                  onChange={handleCropChange}
                />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {t('videoCrop.originalSize', { width: frameWidth, height: frameHeight })}
                </p>
              </>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                <span className="text-sm text-gray-400">{t('videoCrop.loadingFFmpeg')}</span>
              </div>
            )}
          </div>

          {/* Right: Settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoCrop.crop')}
            </h2>

            {/* Crop area display */}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(crop.x)}, {Math.round(crop.y)} - {Math.round(crop.width)} x {Math.round(crop.height)}
              </p>
              <button
                onClick={handleResetCrop}
                className="mt-2 rounded-xl border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label={t('videoCrop.resetCrop')}
              >
                {t('videoCrop.resetCrop')}
              </button>
            </div>

            {/* Crop button */}
            <div className="mt-2">
              <button
                onClick={handleCrop}
                disabled={isCropping || !loaded || frameWidth === 0}
                className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('videoCrop.crop')}
              >
                {isCropping
                  ? t('videoCrop.cropProgress', { progress: cropProgress })
                  : t('videoCrop.crop')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop error alert */}
      {cropError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {cropError}
        </div>
      )}

      {/* Cropping progress bar */}
      {isCropping && (
        <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-purple-600 transition-all"
            style={{ width: `${cropProgress}%` }}
            role="progressbar"
            aria-valuenow={cropProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Output section */}
      {outputVideo && !isCropping && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoCrop.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('videoCrop.outputSize', { size: formatSize(outputVideo.size) })}
            </span>
          </div>
          <Preview file={outputVideo} type="video/mp4" />
          <WorkflowBar
            file={outputVideo}
            fileName="cropped.mp4"
            currentTool="videoCrop"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

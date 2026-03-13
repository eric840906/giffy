import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import { CropOverlay } from '../../../components/CropOverlay/CropOverlay';
import type { CropRect } from '../../../components/CropOverlay/CropOverlay';
import { VideoControls } from '../../../components/VideoControls/VideoControls';
import type { VideoTabProps } from './index';

/**
 * Crop tab for the Video Editor.
 * Extracts frames via hidden video + Canvas, overlays CropOverlay for area selection.
 */
export function CropTab({
  videoFile,
  videoUrl,
  videoWidth: _videoWidth,
  videoHeight: _videoHeight,
  ffmpeg,
  ffmpegLoaded,
  isProcessing,
  onProcessStart,
  onProcessProgress,
  onProcessComplete,
  onProcessError,
}: VideoTabProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef(false);

  // Frame extraction state
  const [frameUrl, setFrameUrl] = useState<string>('');
  const [frameWidth, setFrameWidth] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);

  // Crop rectangle
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /**
   * Extract the current frame from the hidden video element.
   */
  const extractFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    setFrameUrl(canvas.toDataURL('image/png'));
  }, []);

  /**
   * Handle initial video load — extract first frame and set dimensions.
   */
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return;

    setFrameWidth(w);
    setFrameHeight(h);
    setCrop({ x: 0, y: 0, width: w, height: h });
    extractFrame();
  }, [extractFrame]);

  /** Reset crop to full frame */
  const handleResetCrop = useCallback(() => {
    if (frameWidth > 0 && frameHeight > 0) {
      setCrop({ x: 0, y: 0, width: frameWidth, height: frameHeight });
    }
  }, [frameWidth, frameHeight]);

  /**
   * Apply crop using ffmpeg.wasm — `-vf crop=W:H:X:Y`.
   * No `-threads 1` needed (default codec, no explicit libx264).
   */
  const handleCrop = useCallback(async () => {
    if (!videoFile || !ffmpegLoaded) return;

    abortRef.current = false;
    onProcessStart();

    const onProgress = ({ progress }: { progress: number }) => {
      onProcessProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      const ext = videoFile.name?.includes('.') ? videoFile.name.substring(videoFile.name.lastIndexOf('.')) : '.mp4';
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

      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      onProcessComplete(blob);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Crop failed:', err);
      if (!abortRef.current) {
        onProcessError(t('videoCrop.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
    }
  }, [videoFile, ffmpegLoaded, ffmpeg, crop, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <>
      {/* Hidden video element for frame extraction */}
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedData={handleVideoLoaded}
        className="absolute h-px w-px overflow-hidden opacity-0 pointer-events-none"
        style={{ left: '-9999px' }}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />

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
                onChange={setCrop}
              />
              <div className="mt-3">
                <VideoControls videoRef={videoRef} onTimeChange={extractFrame} />
              </div>
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

          <div className="mt-2">
            <button
              onClick={handleCrop}
              disabled={isProcessing || !ffmpegLoaded || frameWidth === 0}
              className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t('videoCrop.crop')}
            >
              {t('videoCrop.crop')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

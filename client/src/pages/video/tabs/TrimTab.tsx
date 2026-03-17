import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import { TimeRangeSlider } from '../../../components/TimeRangeSlider/TimeRangeSlider';
import type { VideoTabProps } from './index';

/**
 * Trim tab for the Video Editor.
 * Provides time-range selection and two-pass trim (stream copy → re-encode fallback).
 */
export function TrimTab({
  videoFile,
  videoUrl,
  videoDuration,
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

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  /** Initialise end time to full duration */
  useEffect(() => {
    if (videoDuration > 0) {
      setEndTime(videoDuration);
    }
  }, [videoDuration]);

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
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
   * Trim video using ffmpeg.wasm.
   * First attempts stream copy (-c copy) for speed; falls back to re-encoding on failure.
   */
  const handleTrim = useCallback(async () => {
    if (!videoFile || !ffmpegLoaded || endTime <= startTime) return;

    abortRef.current = false;
    onProcessStart();

    const onProgress = ({ progress }: { progress: number }) => {
      onProcessProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      const ext = videoFile.name?.includes('.') ? videoFile.name.substring(videoFile.name.lastIndexOf('.')) : '.mp4';
      const inputName = 'input' + ext;
      const outputName = 'output.mp4';
      const duration = endTime - startTime;

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      // Attempt stream copy (fast, no re-encoding)
      let ret = await ffmpeg.exec([
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-i', inputName,
        '-c', 'copy',
        '-y', outputName,
      ]);
      if (abortRef.current) return;

      // Fallback to re-encoding if stream copy failed
      if (ret !== 0) {
        ret = await ffmpeg.exec([
          '-ss', startTime.toString(),
          '-t', duration.toString(),
          '-i', inputName,
          '-y', outputName,
        ]);
        if (abortRef.current) return;
        if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);
      }

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      onProcessComplete(blob);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Trim failed:', err);
      if (!abortRef.current) {
        onProcessError(t('videoTrim.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
    }
  }, [videoFile, ffmpegLoaded, ffmpeg, startTime, endTime, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <div className="flex flex-col gap-4">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
        aria-label={t('videoTrim.title')}
      />

      {videoDuration > 0 && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (videoRef.current) {
                  const ct = videoRef.current.currentTime;
                  setStartTime(Math.min(ct, endTime - 0.1));
                }
              }}
              disabled={isProcessing}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {t('videoTrim.setStart')}
            </button>
            <button
              onClick={() => {
                if (videoRef.current) {
                  const ct = videoRef.current.currentTime;
                  setEndTime(Math.max(ct, startTime + 0.1));
                }
              }}
              disabled={isProcessing}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {t('videoTrim.setEnd')}
            </button>
          </div>
          <TimeRangeSlider
            duration={videoDuration}
            start={startTime}
            end={endTime}
            onChange={handleTimeRangeChange}
          />
        </>
      )}

      <button
        onClick={handleTrim}
        disabled={isProcessing || !ffmpegLoaded || endTime <= startTime}
        className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t('videoTrim.trim')}
      >
        {t('videoTrim.trim')}
      </button>
    </div>
  );
}

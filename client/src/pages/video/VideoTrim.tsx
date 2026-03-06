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

/**
 * Video Trim (time) page.
 * Upload video -> select time range -> trim to output a video segment.
 *
 * Uses stream copy (-c copy) for fast trimming without re-encoding.
 * Falls back to re-encoding if stream copy fails.
 * All processing happens client-side via ffmpeg.wasm.
 */
export function VideoTrim() {
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

  // Output
  const [outputVideo, setOutputVideo] = useState<Blob | null>(null);
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [trimError, setTrimError] = useState<string | null>(null);

  /**
   * Handle video file selection.
   * Creates an object URL for the video player and resets trim state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setOutputVideo(null);
    setStartTime(0);
    setTrimError(null);
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
   * Trim video using ffmpeg.wasm.
   * First attempts stream copy (-c copy) for speed; falls back to re-encoding on failure.
   */
  const handleTrim = useCallback(async () => {
    if (!videoFile || !loaded || endTime <= startTime) return;

    abortRef.current = false;
    setIsTrimming(true);
    setTrimProgress(0);
    setOutputVideo(null);
    setTrimError(null);

    const onProgress = ({ progress }: { progress: number }) => {
      setTrimProgress(Math.round(progress * 100));
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

      const blob = new Blob([data], { type: 'video/mp4' });
      setOutputVideo(blob);

      // Clean up ffmpeg temp files to free memory
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Trim failed:', err);
      if (!abortRef.current) {
        setTrimError(t('videoTrim.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsTrimming(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [videoFile, loaded, ffmpeg, startTime, endTime, t]);

  /**
   * Reset file selection and return to the upload view.
   * Revokes all object URLs and clears output/error state.
   */
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl('');
    setOutputVideo(null);
    setTrimError(null);
    setStartTime(0);
    setEndTime(0);
    setVideoDuration(0);
  }, [videoUrl]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputVideo(null);
    setTrimError(null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoTrim.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-mint-50 p-4 text-center text-sm text-mint-600 dark:bg-mint-950/20 dark:text-mint-400">
          {ffmpegError || t('videoTrim.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoTrim.uploadPrompt')}
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
            disabled={isTrimming}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('upload.changeFile')}
          </button>
        </div>
      )}

      {/* Editor section: video player + time range + trim button */}
      {videoFile && videoUrl && (
        <div className="flex flex-col gap-4">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
            aria-label={t('videoTrim.title')}
          />

          {videoDuration > 0 && (
            <TimeRangeSlider
              duration={videoDuration}
              start={startTime}
              end={endTime}
              onChange={handleTimeRangeChange}
            />
          )}

          <button
            onClick={handleTrim}
            disabled={isTrimming || !loaded || endTime <= startTime}
            className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('videoTrim.trim')}
          >
            {isTrimming
              ? t('videoTrim.trimProgress', { progress: trimProgress })
              : t('videoTrim.trim')}
          </button>
        </div>
      )}

      {/* Trim error alert */}
      {trimError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {trimError}
        </div>
      )}

      {/* Trimming progress bar */}
      {isTrimming && (
        <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-mint-600 transition-all"
            style={{ width: `${trimProgress}%` }}
            role="progressbar"
            aria-valuenow={trimProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Output section */}
      {outputVideo && !isTrimming && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoTrim.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('videoTrim.outputSize', { size: formatSize(outputVideo.size) })}
            </span>
          </div>
          <Preview file={outputVideo} type="video/mp4" />
          <WorkflowBar
            file={outputVideo}
            fileName="trimmed.mp4"
            currentTool="videoTrim"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

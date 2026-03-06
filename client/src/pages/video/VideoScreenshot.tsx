import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, Link } from 'react-router-dom';
import { Upload } from '../../components/Upload/Upload';
import { VideoControls } from '../../components/VideoControls/VideoControls';
import { TOOLS, type ToolId } from '../../utils/constants';
import { formatSize } from '../../utils/formatSize';

/** A single captured screenshot entry */
interface Screenshot {
  id: string;
  blob: Blob;
  url: string;
  timestamp: number;
  format: 'png' | 'jpg';
  fileName: string;
}

/**
 * Formats seconds to mm:ss display string.
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Tools that accept image files (for send-to-tool dropdown) */
const IMAGE_TOOLS = TOOLS.filter(
  (tool) => tool.id !== ('videoScreenshot' as ToolId) && tool.accept.startsWith('image')
);

/**
 * Video Screenshot page.
 * Upload a video -> play/seek to desired frame -> capture as PNG/JPG.
 * Multiple screenshots are stored and can be individually downloaded or sent to other tools.
 *
 * Uses Canvas API for instant frame extraction — no ffmpeg needed.
 */
export function VideoScreenshot() {
  const { t } = useTranslation();
  const location = useLocation();

  /** Ref to the visible <video> element */
  const videoRef = useRef<HTMLVideoElement>(null);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');

  // Screenshot state
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpg'>('png');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Send-to-tool dropdown state per screenshot
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Refs for cleanup on unmount (avoids stale closure with [] deps) */
  const videoUrlRef = useRef(videoUrl);
  videoUrlRef.current = videoUrl;
  const screenshotsRef = useRef(screenshots);
  screenshotsRef.current = screenshots;

  /**
   * Handle video file selection.
   * Creates an object URL for the video player and resets all state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    // Revoke all existing screenshot URLs
    setScreenshots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setCaptureError(null);
  }, [videoUrl]);

  /** Handle file from workflow (passed via router state) */
  useEffect(() => {
    const state = location.state as { file?: File; fileName?: string } | null;
    if (state?.file && state.file !== handledStateRef.current) {
      handledStateRef.current = state.file;
      handleFileSelect([state.file]);
    }
  }, [location.state, handleFileSelect]);

  /** Cleanup all object URLs on unmount */
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      screenshotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    };
  }, []);

  /** Close send-to-tool dropdown on click-outside or Escape */
  useEffect(() => {
    if (!openDropdownId) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdownId(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openDropdownId]);

  /**
   * Reset file selection and return to the upload view.
   * Revokes all object URLs (video + screenshots) and clears state.
   */
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    screenshots.forEach((s) => URL.revokeObjectURL(s.url));
    setVideoFile(null);
    setVideoUrl('');
    setScreenshots([]);
    setCaptureError(null);
  }, [videoUrl, screenshots]);

  /**
   * Capture the current video frame using Canvas API.
   * Draws the video to an offscreen canvas, converts to blob, and appends to screenshots[].
   */
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsCapturing(true);
    setCaptureError(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot get canvas context');

      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      const mimeType = outputFormat === 'jpg' ? 'image/jpeg' : 'image/png';
      const ext = outputFormat === 'jpg' ? 'jpg' : 'png';
      const timestamp = video.currentTime;
      const timeStr = formatTime(timestamp).replace(':', '-');
      const fileName = `screenshot-${timeStr}.${ext}`;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setCaptureError(t('videoScreenshot.error'));
            setIsCapturing(false);
            return;
          }

          const url = URL.createObjectURL(blob);
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          setScreenshots((prev) => [
            ...prev,
            { id, blob, url, timestamp, format: outputFormat, fileName },
          ]);
          setIsCapturing(false);
        },
        mimeType,
        outputFormat === 'jpg' ? 0.92 : undefined
      );
    } catch {
      setCaptureError(t('videoScreenshot.error'));
      setIsCapturing(false);
    }
  }, [outputFormat, t]);

  /**
   * Remove a screenshot by ID.
   * Revokes its object URL before removing from state.
   */
  const handleRemove = useCallback((id: string) => {
    setScreenshots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  /**
   * Download a screenshot.
   * Creates a temporary anchor element and triggers download.
   */
  const handleDownload = useCallback((screenshot: Screenshot) => {
    const a = document.createElement('a');
    a.href = screenshot.url;
    a.download = screenshot.fileName;
    a.click();
  }, []);

  /** No-op callback for VideoControls (we don't need to extract frames on every seek) */
  const handleTimeChange = useCallback(() => {
    // intentionally empty — VideoControls requires this callback
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoScreenshot.title')}
      </h1>

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoScreenshot.uploadPrompt')}
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
            disabled={isCapturing}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('upload.changeFile')}
          </button>
        </div>
      )}

      {/* Video player + settings */}
      {videoFile && videoUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Video player */}
          <div className="lg:col-span-2">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full rounded-xl"
              controls={false}
              muted
              playsInline
              preload="auto"
            />
            <div className="mt-3">
              <VideoControls videoRef={videoRef} onTimeChange={handleTimeChange} />
            </div>
          </div>

          {/* Right: Settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            {/* Output format selector */}
            <div>
              <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
                {t('videoScreenshot.outputFormat')}
              </h2>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="outputFormat"
                    value="png"
                    checked={outputFormat === 'png'}
                    onChange={() => setOutputFormat('png')}
                    className="text-mint-600 focus:ring-mint-500"
                  />
                  PNG
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="outputFormat"
                    value="jpg"
                    checked={outputFormat === 'jpg'}
                    onChange={() => setOutputFormat('jpg')}
                    className="text-mint-600 focus:ring-mint-500"
                  />
                  JPG
                </label>
              </div>
            </div>

            {/* Capture button */}
            <button
              onClick={handleCapture}
              disabled={isCapturing}
              className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t('videoScreenshot.capture')}
            >
              {isCapturing ? t('videoScreenshot.capturing') : t('videoScreenshot.capture')}
            </button>
          </div>
        </div>
      )}

      {/* Capture error */}
      {captureError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {captureError}
        </div>
      )}

      {/* Screenshots list */}
      {videoFile && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoScreenshot.screenshots')}
            </h2>
            {screenshots.length > 0 && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('videoScreenshot.screenshotCount', { count: screenshots.length })}
              </span>
            )}
          </div>

          {screenshots.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {t('videoScreenshot.noScreenshots')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {screenshots.map((screenshot) => (
                <div
                  key={screenshot.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  {/* Thumbnail */}
                  <img
                    src={screenshot.url}
                    alt={t('videoScreenshot.timestamp', { time: formatTime(screenshot.timestamp) })}
                    className="aspect-video w-full object-cover"
                  />

                  {/* Info + actions */}
                  <div className="p-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(screenshot.timestamp)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {t('videoScreenshot.outputSize', { size: formatSize(screenshot.blob.size) })}
                    </p>

                    {/* Action buttons */}
                    <div className="mt-2 flex items-center gap-1">
                      {/* Download */}
                      <button
                        onClick={() => handleDownload(screenshot)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-mint-600 transition-colors hover:bg-mint-50 dark:text-mint-400 dark:hover:bg-mint-950/30"
                        aria-label={t('videoScreenshot.download')}
                        title={t('videoScreenshot.download')}
                      >
                        {t('videoScreenshot.download')}
                      </button>

                      {/* Send to tool */}
                      <div className="relative" ref={openDropdownId === screenshot.id ? dropdownRef : undefined}>
                        <button
                          onClick={() =>
                            setOpenDropdownId((prev) =>
                              prev === screenshot.id ? null : screenshot.id
                            )
                          }
                          className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                          aria-label={t('videoScreenshot.sendToTool')}
                          aria-haspopup="true"
                          aria-expanded={openDropdownId === screenshot.id}
                          title={t('videoScreenshot.sendToTool')}
                        >
                          {t('videoScreenshot.sendToTool')}
                        </button>

                        {openDropdownId === screenshot.id && (
                          <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                            {IMAGE_TOOLS.map((tool) => (
                              <Link
                                key={tool.id}
                                to={tool.path}
                                state={{ file: screenshot.blob, fileName: screenshot.fileName }}
                                className="block px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-mint-50 dark:text-gray-200 dark:hover:bg-gray-700"
                                onClick={() => setOpenDropdownId(null)}
                              >
                                <tool.icon size={16} weight="duotone" className="mr-2 inline-block align-text-bottom" />
                                {t(`home.tools.${tool.id}.name`)}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => handleRemove(screenshot.id)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        aria-label={t('videoScreenshot.remove')}
                        title={t('videoScreenshot.remove')}
                      >
                        {t('videoScreenshot.remove')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

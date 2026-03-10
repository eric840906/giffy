import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';
import { TrimTab, CropTab, ResizeTab, FilterTab } from './tabs';

/** Available tab IDs */
type TabId = 'trim' | 'crop' | 'resize' | 'filter';

/** Tab definition for navigation */
interface TabDef {
  id: TabId;
  labelKey: string;
}

/** Ordered tab definitions */
const TABS: readonly TabDef[] = [
  { id: 'trim', labelKey: 'videoEditor.tabTrim' },
  { id: 'crop', labelKey: 'videoEditor.tabCrop' },
  { id: 'resize', labelKey: 'videoEditor.tabResize' },
  { id: 'filter', labelKey: 'videoEditor.tabFilter' },
] as const;

/**
 * Unified Video Editor page.
 * Combines Trim, Crop, Resize, and Filter tools
 * into a single tabbed interface with shared file/output state.
 * Auto-saves output as new input when switching tabs.
 */
export function VideoEditor() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  /** Hidden video ref for dimension/duration detection */
  const metaVideoRef = useRef<HTMLVideoElement>(null);

  // --- Shared file state ---
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<TabId>('trim');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(new Set(['trim']));
  const [fileVersion, setFileVersion] = useState(0);

  // --- Output state ---
  const [outputVideo, setOutputVideo] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  /** Load ffmpeg on mount */
  useEffect(() => {
    if (!loaded && !ffmpegLoading) {
      load();
    }
  }, [loaded, ffmpegLoading, load]);

  /** Handle initial tab from router state (e.g., redirects from old URLs) */
  useEffect(() => {
    const state = location.state as { tab?: TabId; file?: File } | null;
    if (state?.tab && TABS.some((t) => t.id === state.tab)) {
      setActiveTab(state.tab!);
      setVisitedTabs((prev) => new Set(prev).add(state.tab!));
    }
  }, [location.state]);

  /** Handle file from workflow (passed via router state) */
  useEffect(() => {
    const state = location.state as { file?: File; fileName?: string } | null;
    if (state?.file && state.file !== handledStateRef.current) {
      handledStateRef.current = state.file;
      handleFileSelect([state.file]);
    }
  }, [location.state]);

  /** Cleanup video URL on unmount/change */
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  /** Handle video file selection */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setVideoWidth(0);
    setVideoHeight(0);
    setVideoDuration(0);
    setOutputVideo(null);
    setProcessingError(null);
    setFileVersion((v) => v + 1);
  }, [videoUrl]);

  /** Handle hidden video metadata load to detect dimensions + duration */
  const handleLoadedMetadata = useCallback(() => {
    const video = metaVideoRef.current;
    if (!video) return;
    setVideoWidth(video.videoWidth);
    setVideoHeight(video.videoHeight);
    setVideoDuration(video.duration);
  }, []);

  /** Reset file selection */
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl('');
    setVideoWidth(0);
    setVideoHeight(0);
    setVideoDuration(0);
    setOutputVideo(null);
    setProcessingError(null);
  }, [videoUrl]);

  /** Switch to a tab — auto-saves output as new input if present */
  const handleTabChange = useCallback((tabId: TabId) => {
    if (outputVideo) {
      const newFile = new File([outputVideo], videoFile?.name || 'edited.mp4', { type: 'video/mp4' });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoFile(newFile);
      setVideoUrl(URL.createObjectURL(newFile));
      setOutputVideo(null);
      setProcessingError(null);
      setVideoWidth(0);
      setVideoHeight(0);
      setVideoDuration(0);
      setFileVersion((v) => v + 1);
    }
    setActiveTab(tabId);
    setVisitedTabs((prev) => new Set(prev).add(tabId));
  }, [outputVideo, videoFile, videoUrl]);

  // --- Tab callbacks (shared processing state) ---

  const handleProcessStart = useCallback(() => {
    setIsProcessing(true);
    setProcessProgress(0);
    setOutputVideo(null);
    setProcessingError(null);
  }, []);

  const handleProcessProgress = useCallback((progress: number) => {
    setProcessProgress(progress);
  }, []);

  const handleProcessComplete = useCallback((blob: Blob) => {
    setOutputVideo(blob);
    setIsProcessing(false);
  }, []);

  const handleProcessError = useCallback((message: string) => {
    setProcessingError(message);
    setIsProcessing(false);
  }, []);

  /** Shared tab props */
  const tabProps = {
    videoFile: videoFile!,
    videoUrl,
    videoWidth,
    videoHeight,
    videoDuration,
    ffmpeg,
    ffmpegLoaded: loaded,
    isProcessing,
    onProcessStart: handleProcessStart,
    onProcessProgress: handleProcessProgress,
    onProcessComplete: handleProcessComplete,
    onProcessError: handleProcessError,
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoEditor.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-mint-50 p-4 text-center text-sm text-mint-600 dark:bg-mint-950/20 dark:text-mint-400">
          {ffmpegError || t('videoEditor.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoEditor.uploadPrompt')}
          </p>
          <Upload accept="video/*" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* File info bar */}
      {videoFile && (
        <div className="flex items-center justify-between rounded-xl bg-gray-100 px-4 py-2 dark:bg-gray-800">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
              {videoFile.name}
            </span>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
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

      {/* Hidden video for dimension/duration detection */}
      {videoFile && videoUrl && (
        <video
          ref={metaVideoRef}
          src={videoUrl}
          onLoadedMetadata={handleLoadedMetadata}
          preload="auto"
          className="absolute h-px w-px overflow-hidden opacity-0"
          aria-hidden="true"
        />
      )}

      {/* Tab navigation + editor */}
      {videoFile && videoUrl && (
        <>
          {/* Tab buttons — always visible */}
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => handleTabChange(tab.id)}
                disabled={isProcessing}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-mint-600 shadow-sm dark:bg-gray-700 dark:text-mint-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                } disabled:opacity-50`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          {/* Tab panels — hidden (not unmounted) when output exists */}
          {visitedTabs.has('trim') && (
            <div style={{ display: activeTab === 'trim' && !outputVideo ? undefined : 'none' }} role="tabpanel">
              <TrimTab key={`trim-${fileVersion}`} {...tabProps} />
            </div>
          )}
          {visitedTabs.has('crop') && (
            <div style={{ display: activeTab === 'crop' && !outputVideo ? undefined : 'none' }} role="tabpanel">
              <CropTab key={`crop-${fileVersion}`} {...tabProps} />
            </div>
          )}
          {visitedTabs.has('resize') && (
            <div style={{ display: activeTab === 'resize' && !outputVideo ? undefined : 'none' }} role="tabpanel">
              <ResizeTab key={`resize-${fileVersion}`} {...tabProps} />
            </div>
          )}
          {visitedTabs.has('filter') && (
            <div style={{ display: activeTab === 'filter' && !outputVideo ? undefined : 'none' }} role="tabpanel">
              <FilterTab key={`filter-${fileVersion}`} {...tabProps} />
            </div>
          )}

          {/* Output preview — shown inline when output exists */}
          {outputVideo && !isProcessing && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {t('videoEditor.result')}
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatSize(outputVideo.size)}
                  </span>
                  <button
                    onClick={() => { setOutputVideo(null); setProcessingError(null); }}
                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {t('videoEditor.undo')}
                  </button>
                </div>
              </div>
              <Preview file={outputVideo} type="video/mp4" />
              <WorkflowBar
                file={outputVideo}
                fileName="edited.mp4"
                currentTool="videoEditor"
              />
            </div>
          )}
        </>
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
            className="h-2 rounded-full bg-mint-600 transition-all"
            style={{ width: `${processProgress}%` }}
            role="progressbar"
            aria-valuenow={processProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';
import { CropTab, GifResizeTab, SpeedTab, CompressTab, TextTab } from './tabs';

/** Available tab IDs */
type TabId = 'crop' | 'resize' | 'speed' | 'compress' | 'text';

/** Tab definition for navigation */
interface TabDef {
  id: TabId;
  labelKey: string;
}

/** Ordered tab definitions */
const TABS: readonly TabDef[] = [
  { id: 'crop', labelKey: 'gifEditor.tabCrop' },
  { id: 'resize', labelKey: 'gifEditor.tabResize' },
  { id: 'speed', labelKey: 'gifEditor.tabSpeed' },
  { id: 'compress', labelKey: 'gifEditor.tabCompress' },
  { id: 'text', labelKey: 'gifEditor.tabText' },
] as const;

/**
 * Unified GIF Editor page.
 * Combines Crop/Resize, Speed, Compress, and Text Overlay tools
 * into a single tabbed interface with shared file/output state.
 */
export function GifEditor() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, load } = useFFmpeg();

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // --- Shared file state ---
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [gifUrl, setGifUrl] = useState<string>('');
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<TabId>('crop');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(new Set(['crop']));
  const [fileVersion, setFileVersion] = useState(0);

  // --- Output state ---
  const [outputGif, setOutputGif] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  /** Load ffmpeg on mount */
  useEffect(() => {
    if (!loaded) {
      load();
    }
  }, [loaded, load]);

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

  /** Cleanup GIF URL on unmount/change */
  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
  }, [gifUrl]);

  /** Handle GIF file selection */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (gifUrl) URL.revokeObjectURL(gifUrl);

    setGifFile(file);
    setGifUrl(URL.createObjectURL(file));
    setImageWidth(0);
    setImageHeight(0);
    setOutputGif(null);
    setProcessingError(null);
    setFileVersion((v) => v + 1);
  }, [gifUrl]);

  /** Handle hidden image load to read natural dimensions */
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageWidth(img.naturalWidth);
    setImageHeight(img.naturalHeight);
  }, []);

  /** Reset file selection */
  const handleReset = useCallback(() => {
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    setGifFile(null);
    setGifUrl('');
    setImageWidth(0);
    setImageHeight(0);
    setOutputGif(null);
    setProcessingError(null);
  }, [gifUrl]);

  /** Switch to a tab — auto-saves output as new input if present */
  const handleTabChange = useCallback((tabId: TabId) => {
    if (outputGif) {
      const newFile = new File([outputGif], gifFile?.name || 'edited.gif', { type: 'image/gif' });
      if (gifUrl) URL.revokeObjectURL(gifUrl);
      setGifFile(newFile);
      setGifUrl(URL.createObjectURL(newFile));
      setOutputGif(null);
      setProcessingError(null);
      setImageWidth(0);
      setImageHeight(0);
      setFileVersion((v) => v + 1);
    }
    setActiveTab(tabId);
    setVisitedTabs((prev) => new Set(prev).add(tabId));
  }, [outputGif, gifFile, gifUrl]);

  // --- Tab callbacks (shared processing state) ---

  const handleProcessStart = useCallback(() => {
    setIsProcessing(true);
    setProcessProgress(0);
    setOutputGif(null);
    setProcessingError(null);
  }, []);

  const handleProcessProgress = useCallback((progress: number) => {
    setProcessProgress(progress);
  }, []);

  const handleProcessComplete = useCallback((blob: Blob) => {
    setOutputGif(blob);
    setIsProcessing(false);
  }, []);

  const handleProcessError = useCallback((message: string) => {
    setProcessingError(message);
    setIsProcessing(false);
  }, []);

  /** Shared tab props */
  const tabProps = {
    gifFile: gifFile!,
    gifUrl,
    imageWidth,
    imageHeight,
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
        {t('gifEditor.title')}
      </h1>

      {/* Upload section */}
      {!gifFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('gifEditor.uploadPrompt')}
          </p>
          <Upload accept="image/gif" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* File info bar */}
      {gifFile && (
        <div className="flex items-center justify-between rounded-xl bg-gray-100 px-4 py-2 dark:bg-gray-800">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
              {gifFile.name}
            </span>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
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

      {/* Hidden image for dimension detection */}
      {gifFile && gifUrl && imageWidth === 0 && (
        <img
          src={gifUrl}
          alt=""
          onLoad={handleImageLoad}
          className="absolute h-px w-px overflow-hidden opacity-0"
        />
      )}

      {/* Tab navigation + editor */}
      {gifFile && gifUrl && (
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
          {visitedTabs.has('crop') && (
            <div style={{ display: activeTab === 'crop' && !outputGif ? undefined : 'none' }} role="tabpanel">
              <CropTab key={`crop-${fileVersion}`} {...tabProps} />
            </div>
          )}
          {visitedTabs.has('resize') && (
            <div style={{ display: activeTab === 'resize' && !outputGif ? undefined : 'none' }} role="tabpanel">
              <GifResizeTab key={`resize-${fileVersion}`} {...tabProps} />
            </div>
          )}
          {visitedTabs.has('speed') && (
            <div style={{ display: activeTab === 'speed' && !outputGif ? undefined : 'none' }} role="tabpanel">
              <SpeedTab key={`speed-${fileVersion}`} {...tabProps} />
            </div>
          )}
          {visitedTabs.has('compress') && (
            <div style={{ display: activeTab === 'compress' && !outputGif ? undefined : 'none' }} role="tabpanel">
              <CompressTab key={`compress-${fileVersion}`} {...tabProps} />
            </div>
          )}
          {visitedTabs.has('text') && (
            <div style={{ display: activeTab === 'text' && !outputGif ? undefined : 'none' }} role="tabpanel">
              <TextTab key={`text-${fileVersion}`} {...tabProps} />
            </div>
          )}

          {/* Output preview — shown inline when output exists */}
          {outputGif && !isProcessing && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {t('gifEditor.result')}
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatSize(outputGif.size)}
                  </span>
                  <button
                    onClick={() => { setOutputGif(null); setProcessingError(null); }}
                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {t('gifEditor.undo')}
                  </button>
                </div>
              </div>
              <Preview file={outputGif} type="image/gif" />
              <WorkflowBar
                file={outputGif}
                fileName="edited.gif"
                currentTool="gifEditor"
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

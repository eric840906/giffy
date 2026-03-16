import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Output resolution preset */
type Resolution = 'original' | '1080' | '720' | '480';

/**
 * Video Format Conversion page.
 * Upload a video (MP4, WebM, etc.) -> convert to MP4 (H.264 + AAC).
 *
 * WebM output encoding does NOT work in ffmpeg.wasm:
 * - Single-thread: VP8/libvpx crashes with stack overflow (memory access out of bounds)
 * - Multi-thread: audio encoding (both libopus and libvorbis) causes pthread deadlock
 * - VP8 video-only (-an) works on core-mt@0.12.10 but that version breaks video filters
 *   (palettegen, filter_complex) used by other tools like VideoToGif
 *
 * WebM INPUT decoding works fine — WebM→MP4 conversion is supported.
 * Advanced options include CRF quality and resolution scaling.
 * All processing happens client-side via ffmpeg.wasm.
 */
export function VideoConvert() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');

  // Conversion settings
  const [crf, setCrf] = useState<number>(23);
  const [resolution, setResolution] = useState<Resolution>('original');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Output
  const [outputVideo, setOutputVideo] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  /**
   * Handle video file selection.
   * Creates an object URL for the video player and resets conversion state.
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
  }, [videoUrl]);

  /** Load ffmpeg on mount */
  useEffect(() => {
    if (!loaded) {
      load();
    }
  }, [loaded, load]);

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
   * Convert video to MP4 using ffmpeg.wasm (H.264 + AAC).
   */
  const handleConvert = useCallback(async () => {
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

    try {
      const ext = videoFile.name?.includes('.')
        ? videoFile.name.substring(videoFile.name.lastIndexOf('.'))
        : '.mp4';
      const inputName = `input${ext}`;
      const outputName = 'converted.mp4';

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      // Build ffmpeg arguments — MP4 output (H.264 + AAC).
      const args: string[] = ['-i', inputName];

      // H.264 video encoding
      args.push('-c:v', 'libx264');
      args.push('-preset', 'ultrafast');
      args.push('-crf', String(crf));

      // AAC audio encoding
      args.push('-c:a', 'aac', '-b:a', '128k');

      // Resolution (if not original)
      if (resolution !== 'original') {
        args.push('-vf', `scale=-2:${resolution}`);
      }

      // -threads 1 prevents pthread deadlock in ffmpeg.wasm multi-thread build
      // when using scale filter with libx264 encoding
      args.push('-threads', '1');

      args.push('-y', outputName);

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;

      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      setOutputVideo(blob);

      // Clean up ffmpeg temp files to free memory
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Conversion failed:', err);
      if (!abortRef.current) {
        setProcessingError(t('videoConvert.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsProcessing(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [videoFile, loaded, ffmpeg, crf, resolution, t]);

  /**
   * Reset file selection and return to the upload view.
   * Revokes all object URLs and clears output/error state.
   */
  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl('');
    setOutputVideo(null);
    setProcessingError(null);
  }, [videoUrl]);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputVideo(null);
    setProcessingError(null);
  }, []);

  /**
   * Derive the original file format from the file extension.
   * Falls back to 'MP4' if no extension is found (e.g. Blob workflow files).
   */
  const getOriginalFormat = useCallback((): string => {
    if (!videoFile) return '';
    if (videoFile.name?.includes('.')) {
      return videoFile.name.substring(videoFile.name.lastIndexOf('.') + 1).toUpperCase();
    }
    return 'MP4';
  }, [videoFile]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoConvert.title')}
      </h1>

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoConvert.uploadPrompt')}
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

      {/* Editor section: video preview + settings panel */}
      {videoFile && videoUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Video player and original info */}
          <div className="lg:col-span-2">
            <video
              src={videoUrl}
              controls
              className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
              aria-label={t('videoConvert.title')}
            />
            {/* Original file info */}
            <div className="mt-3 flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-2 dark:bg-gray-800">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('videoConvert.originalInfo')}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('videoConvert.format')}: {getOriginalFormat()}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {formatSize(videoFile.size)}
              </span>
            </div>
          </div>

          {/* Right: Settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            {/* Target format (MP4 only) */}
            <div>
              <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
                {t('videoConvert.targetFormat')}
              </h2>
              <div className="flex gap-2">
                <span className="flex-1 rounded-xl bg-mint-600 px-4 py-2 text-center text-sm font-medium text-white">
                  MP4
                </span>
              </div>
            </div>

            {/* Collapsible advanced options */}
            <div>
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                aria-expanded={showAdvanced}
              >
                {t('videoConvert.advancedOptions')}
                <span
                  className={`ml-2 inline-block transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-2 flex flex-col gap-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50">
                  {/* Quality (CRF) slider */}
                  <div>
                    <label
                      htmlFor="crf-slider"
                      className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
                    >
                      {t('videoConvert.quality')}: {crf}
                    </label>
                    <input
                      id="crf-slider"
                      type="range"
                      min={0}
                      max={51}
                      value={crf}
                      onChange={(e) => setCrf(Number(e.target.value))}
                      className="w-full accent-mint-600"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t('videoConvert.qualityHint')}
                    </p>
                  </div>

                  {/* Resolution dropdown */}
                  <div>
                    <label
                      htmlFor="resolution-select"
                      className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
                    >
                      {t('videoConvert.resolution')}
                    </label>
                    <select
                      id="resolution-select"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as Resolution)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="original">{t('videoConvert.resolutionOriginal')}</option>
                      <option value="1080">1080p</option>
                      <option value="720">720p</option>
                      <option value="480">480p</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Convert button */}
            <div className="mt-2">
              <button
                onClick={handleConvert}
                disabled={isProcessing || !loaded}
                className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('videoConvert.convert')}
              >
                {isProcessing
                  ? t('videoConvert.convertProgress', { progress: processProgress })
                  : t('videoConvert.convert')}
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
            className="h-2 rounded-full bg-mint-600 transition-all"
            style={{ width: `${processProgress}%` }}
            role="progressbar"
            aria-valuenow={processProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Output section */}
      {outputVideo && !isProcessing && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('videoConvert.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('videoConvert.outputSize', { size: formatSize(outputVideo.size) })}
            </span>
          </div>
          <Preview file={outputVideo} type="video/mp4" />
          <WorkflowBar
            file={outputVideo}
            fileName="converted.mp4"
            currentTool="videoConvert"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}

    </div>
  );
}

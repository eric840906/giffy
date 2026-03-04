import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { Preview } from '../../components/Preview/Preview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Target container format for video conversion */
type TargetFormat = 'mp4' | 'webm';

/** Video codec option (VP8 used for WebM — VP9 exceeds wasm memory limits) */
type VideoCodec = 'h264' | 'vp8';

/** Audio codec option */
type AudioCodec = 'aac' | 'opus';

/** Output resolution preset */
type Resolution = 'original' | '1080' | '720' | '480';

/**
 * Video Format Conversion page.
 * Upload a video -> select target format and optional advanced settings -> convert.
 *
 * Supports MP4 (H.264 + AAC) and WebM (VP8 + Opus) output formats.
 * VP8 is used instead of VP9 because VP9 exceeds wasm memory limits.
 * Advanced options include codec override, CRF quality, and resolution scaling.
 * All processing happens client-side via ffmpeg.wasm.
 */
export function VideoConvert() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');

  // Conversion settings
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('mp4');
  const [videoCodec, setVideoCodec] = useState<VideoCodec>('h264');
  // Note: VP8 is used for WebM instead of VP9 due to wasm memory constraints
  const [audioCodec, setAudioCodec] = useState<AudioCodec>('aac');
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
   * Handle target format change.
   * Automatically updates video and audio codec defaults based on the selected format.
   * MP4 -> H.264 + AAC, WebM -> VP8 + Opus.
   */
  const handleFormatChange = useCallback((format: TargetFormat) => {
    setTargetFormat(format);
    if (format === 'mp4') {
      setVideoCodec('h264');
      setAudioCodec('aac');
    } else {
      setVideoCodec('vp8');
      setAudioCodec('opus');
    }
  }, []);

  /**
   * Convert video using ffmpeg.wasm.
   * Constructs the ffmpeg command based on selected format, codec, quality, and resolution.
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
      const outputName = `converted.${targetFormat}`;

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      // Build ffmpeg arguments.
      // Now using @ffmpeg/core-mt with enough memory for explicit codecs.
      // Force -threads 1 to avoid slow wasm pthread overhead.
      const args: string[] = ['-i', inputName];

      // Video codec
      if (videoCodec === 'h264') {
        args.push('-c:v', 'libx264');
        args.push('-preset', 'ultrafast');
        args.push('-crf', String(crf));
      } else {
        args.push('-c:v', 'libvpx');
        args.push('-b:v', '1M', '-crf', String(crf));
        args.push('-cpu-used', '4', '-deadline', 'good');
      }

      // Audio codec
      if (audioCodec === 'aac') {
        args.push('-c:a', 'aac', '-b:a', '128k');
      } else {
        args.push('-c:a', 'libopus', '-b:a', '128k');
      }

      // Force single-thread encoding — wasm pthread overhead makes
      // multi-threaded encoding hang or run extremely slowly
      args.push('-threads', '1');

      // Resolution (if not original)
      if (resolution !== 'original') {
        args.push('-vf', `scale=-2:${resolution}`);
      }

      args.push('-y', outputName);

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;

      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const outputMime = targetFormat === 'mp4' ? 'video/mp4' : 'video/webm';
      const blob = new Blob([data], { type: outputMime });
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
  }, [videoFile, loaded, ffmpeg, targetFormat, videoCodec, audioCodec, crf, resolution, t]);

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

  /** Output MIME type based on target format */
  const outputMime = targetFormat === 'mp4' ? 'video/mp4' : 'video/webm';

  /** Output filename based on target format */
  const outputFileName = `converted.${targetFormat}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('videoConvert.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('videoConvert.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!videoFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('videoConvert.uploadPrompt')}
          </p>
          <Upload accept="video/*" onFileSelect={handleFileSelect} />
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
            {/* Target format selector */}
            <div>
              <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
                {t('videoConvert.targetFormat')}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFormatChange('mp4')}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    targetFormat === 'mp4'
                      ? 'bg-purple-600 text-white'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  aria-pressed={targetFormat === 'mp4'}
                >
                  MP4
                </button>
                <button
                  onClick={() => handleFormatChange('webm')}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    targetFormat === 'webm'
                      ? 'bg-purple-600 text-white'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  aria-pressed={targetFormat === 'webm'}
                >
                  WebM
                </button>
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
                  {/* Video codec */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                      {t('videoConvert.videoCodec')}
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVideoCodec('h264')}
                        className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                          videoCodec === 'h264'
                            ? 'bg-purple-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                        aria-pressed={videoCodec === 'h264'}
                      >
                        H.264
                      </button>
                      <button
                        onClick={() => setVideoCodec('vp8')}
                        className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                          videoCodec === 'vp8'
                            ? 'bg-purple-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                        aria-pressed={videoCodec === 'vp8'}
                      >
                        VP8
                      </button>
                    </div>
                  </div>

                  {/* Audio codec */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                      {t('videoConvert.audioCodec')}
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAudioCodec('aac')}
                        className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                          audioCodec === 'aac'
                            ? 'bg-purple-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                        aria-pressed={audioCodec === 'aac'}
                      >
                        AAC
                      </button>
                      <button
                        onClick={() => setAudioCodec('opus')}
                        className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                          audioCodec === 'opus'
                            ? 'bg-purple-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                        aria-pressed={audioCodec === 'opus'}
                      >
                        Opus
                      </button>
                    </div>
                  </div>

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
                      className="w-full accent-purple-600"
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
                className="w-full rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          <Preview file={outputVideo} type={outputMime} />
          <WorkflowBar
            file={outputVideo}
            fileName={outputFileName}
            currentTool="videoConvert"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

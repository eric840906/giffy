import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import { Upload } from '../../components/Upload/Upload';
import { FrameGrid, type FrameData } from '../../components/FrameGrid/FrameGrid';
import { FramePreview } from '../../components/FramePreview/FramePreview';
import { WorkflowBar } from '../../components/WorkflowBar/WorkflowBar';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';

/** Available speed multiplier presets */
const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3] as const;

/** Supported animated output formats */
type OutputFormat = 'gif' | 'apng' | 'webp';

/** MIME type mapping for each output format */
const MIME_MAP: Record<OutputFormat, string> = {
  gif: 'image/gif',
  apng: 'image/apng',
  webp: 'image/webp',
};

/** Extension mapping for each output format */
const EXT_MAP: Record<OutputFormat, string> = {
  gif: '.gif',
  apng: '.apng',
  webp: '.webp',
};

/** Loop mode: infinite or custom count */
type LoopMode = 'infinite' | 'custom';

/** Output size mode: keep original or custom */
type SizeMode = 'original' | 'custom';

/** Unique ID counter for frames */
let frameIdCounter = 0;

/**
 * Generate a unique frame ID.
 * @returns A unique string ID
 */
function nextFrameId(): string {
  return `f-${++frameIdCounter}`;
}

/**
 * Animated Image Frame Editor page.
 * Upload a GIF/APNG/WebP -> extract all frames -> grid view with selection,
 * reorder, delete, copy, reverse -> configure delays, output format/size ->
 * reassemble into GIF/APNG/WebP.
 *
 * All processing happens client-side via ffmpeg.wasm.
 */
export function FrameEditor() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  // --- Input state ---
  const [inputFile, setInputFile] = useState<File | null>(null);

  // --- Frame state ---
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // --- Extraction state ---
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);

  // --- Settings state ---
  const [globalDelay, setGlobalDelay] = useState<number>(100);
  const [perFrameDelay, setPerFrameDelay] = useState<number>(100);
  const [loopMode, setLoopMode] = useState<LoopMode>('infinite');
  const [loopCustomCount, setLoopCustomCount] = useState<number>(1);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('gif');
  const [sizeMode, setSizeMode] = useState<SizeMode>('original');
  const [outputWidth, setOutputWidth] = useState<number>(480);
  const [outputHeight, setOutputHeight] = useState<number>(480);

  // --- Output state ---
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

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
  }, [location.state]);

  /** Cleanup on unmount: abort in-flight operations */
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  /**
   * Handle file selection. Triggers frame extraction.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    setInputFile(file);
    setFrames([]);
    setSelectedIds(new Set());
    setOutputBlob(null);
    setProcessingError(null);
  }, []);

  /**
   * Extract frames from the input file using ffmpeg.wasm.
   * Parses frame delays from log output, then extracts individual PNG frames.
   */
  useEffect(() => {
    if (!inputFile || !loaded) return;

    let cancelled = false;

    const extractFrames = async () => {
      abortRef.current = false;
      setIsExtracting(true);
      setExtractProgress(0);

      try {
        // Write input file
        const inputName = 'input_anim';
        await ffmpeg.writeFile(inputName, await fetchFile(inputFile));
        if (cancelled || abortRef.current) return;

        // Collect log output for delay parsing
        const logLines: string[] = [];
        const onLog = ({ message }: { message: string }) => {
          logLines.push(message);
        };
        ffmpeg.on('log', onLog);

        // Probe to get frame timing info
        await ffmpeg.exec([
          '-i', inputName,
          '-f', 'null',
          '-threads', '1',
          '-',
        ]);
        ffmpeg.off('log', onLog);

        if (cancelled || abortRef.current) return;

        // Parse frame count from log
        let frameCount = 0;
        // Look for "frame= N" patterns in ffmpeg output
        for (const line of logLines) {
          const match = line.match(/frame=\s*(\d+)/);
          if (match) {
            frameCount = Math.max(frameCount, parseInt(match[1], 10));
          }
        }

        // Parse frame delays from pts_time values
        const ptsTimes: number[] = [];
        for (const line of logLines) {
          const match = line.match(/pts_time[=:]\s*([\d.]+)/);
          if (match) {
            ptsTimes.push(parseFloat(match[1]));
          }
        }

        if (cancelled || abortRef.current) return;

        // Extract frames as PNGs
        const onProgress = ({ progress }: { progress: number }) => {
          setExtractProgress(Math.round(progress * 100));
        };
        ffmpeg.on('progress', onProgress);

        await ffmpeg.exec([
          '-i', inputName,
          '-threads', '1',
          '-y', 'frame_%04d.png',
        ]);
        ffmpeg.off('progress', onProgress);

        if (cancelled || abortRef.current) return;

        // Read extracted frames
        const extractedFrames: FrameData[] = [];
        let i = 1;
        while (true) {
          const frameName = `frame_${String(i).padStart(4, '0')}.png`;
          try {
            const data = await ffmpeg.readFile(frameName);
            if (cancelled || abortRef.current) break;

            // Calculate delay for this frame
            let delay = 100; // default 100ms
            if (ptsTimes.length >= i + 1) {
              delay = Math.round((ptsTimes[i] - ptsTimes[i - 1]) * 1000);
              if (delay <= 0 || delay > 10000) delay = 100;
            }

            extractedFrames.push({
              id: nextFrameId(),
              blob: new Blob([data], { type: 'image/png' }),
              delay,
              originalIndex: i,
            });

            // Clean up frame file from FS immediately
            try { await ffmpeg.deleteFile(frameName); } catch { /* ignore */ }
            i++;
          } catch {
            // No more frames
            break;
          }
        }

        // Clean up input file
        try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }

        if (!cancelled && !abortRef.current) {
          setFrames(extractedFrames);
          // Set global delay to the most common delay
          if (extractedFrames.length > 0) {
            const delayMap = new Map<number, number>();
            for (const f of extractedFrames) {
              delayMap.set(f.delay, (delayMap.get(f.delay) || 0) + 1);
            }
            let mostCommon = 100;
            let maxCount = 0;
            delayMap.forEach((count, d) => {
              if (count > maxCount) {
                maxCount = count;
                mostCommon = d;
              }
            });
            setGlobalDelay(mostCommon);
            setPerFrameDelay(mostCommon);
          }
        }
      } catch (err) {
        console.error('Frame extraction failed:', err);
        if (!cancelled && !abortRef.current) {
          setProcessingError(t('frameEditor.error'));
        }
      } finally {
        if (!cancelled && !abortRef.current) {
          setIsExtracting(false);
        }
      }
    };

    extractFrames();

    return () => {
      cancelled = true;
    };
  }, [inputFile, loaded, ffmpeg, t]);

  // --- Frame operations ---

  /** Select all frames */
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(frames.map((f) => f.id)));
  }, [frames]);

  /** Deselect all frames */
  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /** Delete selected frames */
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setFrames((prev) => prev.filter((f) => !selectedIds.has(f.id)));
    setSelectedIds(new Set());
  }, [selectedIds]);

  /** Copy selected frames (insert copies after the last selected frame) */
  const handleCopySelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setFrames((prev) => {
      const newFrames = [...prev];
      // Find last selected index
      let lastSelectedIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (selectedIds.has(prev[i].id)) {
          lastSelectedIndex = i;
          break;
        }
      }
      if (lastSelectedIndex === -1) return prev;

      // Create copies of selected frames
      const copies: FrameData[] = prev
        .filter((f) => selectedIds.has(f.id))
        .map((f) => ({
          ...f,
          id: nextFrameId(),
        }));

      // Insert copies after the last selected frame
      newFrames.splice(lastSelectedIndex + 1, 0, ...copies);
      return newFrames;
    });
  }, [selectedIds]);

  /** Delete a single frame by ID */
  const handleDeleteOne = useCallback((id: string) => {
    setFrames((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /** Duplicate a single frame by ID (insert copy right after it) */
  const handleDuplicateOne = useCallback((id: string) => {
    setFrames((prev) => {
      const index = prev.findIndex((f) => f.id === id);
      if (index === -1) return prev;
      const copy = { ...prev[index], id: nextFrameId() };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  /** Reverse all frames */
  const handleReverseAll = useCallback(() => {
    setFrames((prev) => [...prev].reverse());
  }, []);

  /** Apply global delay to all frames */
  const handleApplyGlobalDelay = useCallback(() => {
    setFrames((prev) =>
      prev.map((f) => ({ ...f, delay: globalDelay })),
    );
  }, [globalDelay]);

  /** Apply speed preset to all frames */
  const handleSpeedPreset = useCallback(
    (speed: number) => {
      setFrames((prev) =>
        prev.map((f) => ({
          ...f,
          delay: Math.max(10, Math.round(f.delay / speed)),
        })),
      );
    },
    [],
  );

  /** Apply per-frame delay to selected frames */
  const handleApplyPerFrameDelay = useCallback(() => {
    if (selectedIds.size === 0) return;
    setFrames((prev) =>
      prev.map((f) =>
        selectedIds.has(f.id) ? { ...f, delay: perFrameDelay } : f,
      ),
    );
  }, [selectedIds, perFrameDelay]);

  /**
   * Reset file selection and return to the upload view.
   */
  const handleReset = useCallback(() => {
    setInputFile(null);
    setFrames([]);
    setSelectedIds(new Set());
    setOutputBlob(null);
    setProcessingError(null);
  }, []);

  /** Reset output and return to editing */
  const handleContinueEdit = useCallback(() => {
    setOutputBlob(null);
    setProcessingError(null);
  }, []);

  /**
   * Generate output animated image from frames.
   * Uses concat demuxer with per-frame durations for reassembly.
   */
  const handleGenerate = useCallback(async () => {
    if (frames.length === 0 || !loaded) return;

    abortRef.current = false;
    setIsGenerating(true);
    setGenerateProgress(0);
    setOutputBlob(null);
    setProcessingError(null);

    const onProgress = ({ progress }: { progress: number }) => {
      setGenerateProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      // Write each frame to ffmpeg FS
      for (let i = 0; i < frames.length; i++) {
        const name = `out_frame_${String(i + 1).padStart(4, '0')}.png`;
        await ffmpeg.writeFile(name, await fetchFile(frames[i].blob));
        if (abortRef.current) return;
      }

      // Build concat demuxer list
      let listContent = '';
      for (let i = 0; i < frames.length; i++) {
        const name = `out_frame_${String(i + 1).padStart(4, '0')}.png`;
        const durationSec = (frames[i].delay / 1000).toFixed(4);
        listContent += `file '${name}'\nduration ${durationSec}\n`;
      }
      // Repeat last frame for proper last-frame duration
      const lastName = `out_frame_${String(frames.length).padStart(4, '0')}.png`;
      listContent += `file '${lastName}'\n`;

      await ffmpeg.writeFile('list.txt', new TextEncoder().encode(listContent));
      if (abortRef.current) return;

      const loopN = loopMode === 'infinite' ? 0 : loopCustomCount;
      const scaleFilter = sizeMode === 'custom' ? `scale=${outputWidth}:${outputHeight}:flags=lanczos` : '';

      let outputName: string;
      let ret: number;

      if (outputFormat === 'gif') {
        outputName = 'output.gif';
        const vfBase = scaleFilter ? `${scaleFilter},` : '';

        // Pass 1: Generate palette
        ret = await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'list.txt',
          '-vf', `${vfBase}palettegen=max_colors=256`,
          '-threads', '1',
          '-y', 'palette.png',
        ]);
        if (abortRef.current) return;

        if (ret !== 0) throw new Error(`ffmpeg palettegen exited with code ${ret}`);

        // Pass 2: Apply palette
        const filterComplex = scaleFilter
          ? `[0:v]${scaleFilter}[x];[x][1:v]paletteuse`
          : '[0:v][1:v]paletteuse';

        ret = await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'list.txt',
          '-i', 'palette.png',
          '-filter_complex', filterComplex,
          '-loop', String(loopN),
          '-threads', '1',
          '-filter_threads', '1',
          '-filter_complex_threads', '1',
          '-y', outputName,
        ]);
        if (abortRef.current) return;

        if (ret !== 0) throw new Error(`ffmpeg paletteuse exited with code ${ret}`);

        try { await ffmpeg.deleteFile('palette.png'); } catch { /* ignore */ }
      } else if (outputFormat === 'apng') {
        outputName = 'output.apng';
        const args = [
          '-f', 'concat', '-safe', '0', '-i', 'list.txt',
        ];
        if (scaleFilter) {
          args.push('-vf', scaleFilter);
        }
        args.push(
          '-f', 'apng',
          '-plays', String(loopN),
          '-threads', '1',
          '-y', outputName,
        );

        ret = await ffmpeg.exec(args);
        if (abortRef.current) return;

        if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);
      } else {
        outputName = 'output.webp';
        const args = [
          '-f', 'concat', '-safe', '0', '-i', 'list.txt',
        ];
        if (scaleFilter) {
          args.push('-vf', scaleFilter);
        }
        args.push(
          '-c:v', 'libwebp_anim',
          '-loop', String(loopN),
          '-quality', '80',
          '-threads', '1',
          '-y', outputName,
        );

        ret = await ffmpeg.exec(args);
        if (abortRef.current) return;

        if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);
      }

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      setOutputBlob(new Blob([data], { type: MIME_MAP[outputFormat] }));
    } catch (err) {
      console.error('Generation failed:', err);
      if (!abortRef.current) {
        setProcessingError(t('frameEditor.error'));
      }
    } finally {
      // Clean up all temp files
      for (let i = 0; i < frames.length; i++) {
        const name = `out_frame_${String(i + 1).padStart(4, '0')}.png`;
        try { await ffmpeg.deleteFile(name); } catch { /* ignore */ }
      }
      try { await ffmpeg.deleteFile('list.txt'); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile(`output.${outputFormat}`); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile('palette.png'); } catch { /* ignore */ }

      if (!abortRef.current) {
        setIsGenerating(false);
      }
      ffmpeg.off('progress', onProgress);
    }
  }, [frames, loaded, ffmpeg, outputFormat, loopMode, loopCustomCount, sizeMode, outputWidth, outputHeight, t]);

  /** Compute the loop count value for FramePreview */
  const previewLoopCount = loopMode === 'infinite' ? 0 : loopCustomCount;

  /** Compute estimated output file size (rough heuristic) */
  const estimatedSize = frames.reduce((sum, f) => sum + f.blob.size, 0);

  const isProcessing = isExtracting || isGenerating;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('frameEditor.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-mint-50 p-4 text-center text-sm text-mint-600 dark:bg-mint-950/20 dark:text-mint-400">
          {ffmpegError || t('frameEditor.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section */}
      {!inputFile && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('frameEditor.uploadPrompt')}
          </p>
          <Upload accept="image/gif,image/apng,image/png,image/webp" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* File info bar with change file button */}
      {inputFile && (
        <div className="flex items-center justify-between rounded-xl bg-gray-100 px-4 py-2 dark:bg-gray-800">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
              {inputFile.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {formatSize(inputFile.size)}
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

      {/* Extraction progress */}
      {isExtracting && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('frameEditor.extractProgress', { progress: extractProgress })}
          </p>
          <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-2 rounded-full bg-mint-600 transition-all"
              style={{ width: `${extractProgress}%` }}
              role="progressbar"
              aria-valuenow={extractProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {/* Editor section: shown after frames are extracted */}
      {frames.length > 0 && !isExtracting && !outputBlob && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column: Frame grid + action bar + preview + stats */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSelectAll}
                disabled={isProcessing}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t('frameEditor.selectAll')}
              </button>
              <button
                onClick={handleDeselectAll}
                disabled={isProcessing || selectedIds.size === 0}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t('frameEditor.deselectAll')}
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={isProcessing || selectedIds.size === 0}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                {t('frameEditor.deleteSelected')}
              </button>
              <button
                onClick={handleCopySelected}
                disabled={isProcessing || selectedIds.size === 0}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t('frameEditor.copySelected')}
              </button>
              <button
                onClick={handleReverseAll}
                disabled={isProcessing}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t('frameEditor.reverseAll')}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-mint-600 dark:text-mint-400">
                  {t('frameEditor.selection', { count: selectedIds.size })}
                </span>
              )}
            </div>

            {/* Frame grid */}
            <FrameGrid
              frames={frames}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onReorder={setFrames}
              onDelete={handleDeleteOne}
              onDuplicate={handleDuplicateOne}
              disabled={isProcessing}
            />

            {/* Preview */}
            <FramePreview frames={frames} loopCount={previewLoopCount} />

            {/* Stats */}
            <div className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-2 text-sm dark:bg-gray-800">
              <span className="text-gray-600 dark:text-gray-300">
                {t('frameEditor.totalFrames')}: <span className="font-medium">{frames.length}</span>
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                {t('frameEditor.estimatedSize')}: <span className="font-medium">{formatSize(estimatedSize)}</span>
              </span>
            </div>
          </div>

          {/* Right column: Settings panel */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('frameEditor.settings')}
            </h2>

            {/* Global delay */}
            <div>
              <label
                htmlFor="global-delay"
                className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {t('frameEditor.globalDelay')}
              </label>
              <div className="flex gap-2">
                <input
                  id="global-delay"
                  type="number"
                  min={10}
                  max={10000}
                  value={globalDelay}
                  onChange={(e) => setGlobalDelay(Math.max(10, Number(e.target.value) || 10))}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  onClick={handleApplyGlobalDelay}
                  disabled={isProcessing}
                  className="shrink-0 rounded-xl bg-mint-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-mint-700 disabled:opacity-50"
                >
                  {t('frameEditor.applyToAll')}
                </button>
              </div>
            </div>

            {/* Speed presets */}
            <div>
              <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('frameEditor.speedPresets')}
              </p>
              <div className="flex flex-wrap gap-2">
                {SPEED_PRESETS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSpeedPreset(s)}
                    disabled={isProcessing}
                    className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {t('frameEditor.speedMultiplier', { speed: s })}
                  </button>
                ))}
              </div>
            </div>

            {/* Loop count */}
            <div>
              <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('frameEditor.loopCount')}
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setLoopMode('infinite')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      loopMode === 'infinite'
                        ? 'bg-mint-600 text-white'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t('frameEditor.loopInfinite')}
                  </button>
                  <button
                    onClick={() => setLoopMode('custom')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      loopMode === 'custom'
                        ? 'bg-mint-600 text-white'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t('frameEditor.loopCustom')}
                  </button>
                </div>
                {loopMode === 'custom' && (
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={loopCustomCount}
                    onChange={(e) => setLoopCustomCount(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    aria-label={t('frameEditor.loopCustom')}
                  />
                )}
              </div>
            </div>

            {/* Per-frame delay */}
            <div>
              <label
                htmlFor="per-frame-delay"
                className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {t('frameEditor.perFrameDelay')}
              </label>
              <div className="flex gap-2">
                <input
                  id="per-frame-delay"
                  type="number"
                  min={10}
                  max={10000}
                  value={perFrameDelay}
                  onChange={(e) => setPerFrameDelay(Math.max(10, Number(e.target.value) || 10))}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  onClick={handleApplyPerFrameDelay}
                  disabled={isProcessing || selectedIds.size === 0}
                  className="shrink-0 rounded-xl bg-mint-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-mint-700 disabled:opacity-50"
                >
                  {t('frameEditor.applyToSelected')}
                </button>
              </div>
            </div>

            {/* Output format */}
            <div>
              <label
                htmlFor="output-format"
                className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {t('frameEditor.outputFormat')}
              </label>
              <select
                id="output-format"
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="gif">GIF</option>
                <option value="apng">APNG</option>
                <option value="webp">WebP</option>
              </select>
            </div>

            {/* Output size */}
            <div>
              <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('frameEditor.outputSize')}
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setSizeMode('original')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      sizeMode === 'original'
                        ? 'bg-mint-600 text-white'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t('frameEditor.keepOriginal')}
                  </button>
                  <button
                    onClick={() => setSizeMode('custom')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                      sizeMode === 'custom'
                        ? 'bg-mint-600 text-white'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t('frameEditor.customSize')}
                  </button>
                </div>
                {sizeMode === 'custom' && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label htmlFor="output-width" className="text-xs text-gray-500 dark:text-gray-400">
                        {t('frameEditor.width')}
                      </label>
                      <input
                        id="output-width"
                        type="number"
                        min={16}
                        max={4096}
                        value={outputWidth}
                        onChange={(e) => setOutputWidth(Math.max(16, Number(e.target.value) || 16))}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="output-height" className="text-xs text-gray-500 dark:text-gray-400">
                        {t('frameEditor.height')}
                      </label>
                      <input
                        id="output-height"
                        type="number"
                        min={16}
                        max={4096}
                        value={outputHeight}
                        onChange={(e) => setOutputHeight(Math.max(16, Number(e.target.value) || 16))}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Generate button */}
            <div className="mt-2">
              <button
                onClick={handleGenerate}
                disabled={isProcessing || !loaded || frames.length === 0}
                className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('frameEditor.generate')}
              >
                {isGenerating
                  ? t('frameEditor.generateProgress', { progress: generateProgress })
                  : t('frameEditor.generate')}
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

      {/* Generating progress bar */}
      {isGenerating && (
        <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-mint-600 transition-all"
            style={{ width: `${generateProgress}%` }}
            role="progressbar"
            aria-valuenow={generateProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Output section */}
      {outputBlob && !isGenerating && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('frameEditor.result')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('frameEditor.resultSize', { size: formatSize(outputBlob.size) })}
            </span>
          </div>
          {/* Output preview: show as image if possible */}
          <div className="flex items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
            <OutputPreviewImage blob={outputBlob} />
          </div>
          <WorkflowBar
            file={outputBlob}
            fileName={`frame-edited${EXT_MAP[outputFormat]}`}
            currentTool="frameEditor"
            onContinueEdit={handleContinueEdit}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Helper component to render an output blob as an image.
 * Uses useState + useEffect for object URL management.
 */
function OutputPreviewImage({ blob }: { blob: Blob }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return (
    <img
      src={url}
      alt={t('frameEditor.result')}
      className="max-h-96 max-w-full object-contain"
    />
  );
}

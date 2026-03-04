import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { fetchFile } from '@ffmpeg/util';
import JSZip from 'jszip';
import { Upload } from '../../components/Upload/Upload';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { formatSize } from '../../utils/formatSize';
import { TOOLS } from '../../utils/constants';

/** Supported animated image output formats */
type AnimatedOutputFormat = 'gif' | 'apng' | 'webp';

/** Result item after conversion */
interface ConvertResult {
  /** Original file name before conversion */
  originalName: string;
  /** Converted file blob */
  blob: Blob;
  /** Suggested file name for download */
  fileName: string;
}

/** MIME type mapping for each animated output format */
const MIME_MAP: Record<AnimatedOutputFormat, string> = {
  gif: 'image/gif',
  apng: 'image/apng',
  webp: 'image/webp',
};

/**
 * Batch animated image format conversion page.
 * Supports GIF, APNG, and animated WebP conversion with individual and ZIP batch download.
 *
 * All processing happens client-side via ffmpeg.wasm.
 */
export function AnimatedImageConvert() {
  const { t } = useTranslation();
  const location = useLocation();
  const { ffmpeg, loaded, loading: ffmpegLoading, error: ffmpegError, load } = useFFmpeg();

  /** Ref to abort in-flight ffmpeg operations on unmount */
  const abortRef = useRef(false);

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  /** Ref for the hidden "add more" file input */
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // --- State ---
  /** Input animated image files */
  const [images, setImages] = useState<File[]>([]);

  /** Target output format */
  const [targetFormat, setTargetFormat] = useState<AnimatedOutputFormat>('gif');

  /** Conversion results */
  const [results, setResults] = useState<ConvertResult[]>([]);

  /** Whether a conversion is in progress */
  const [isConverting, setIsConverting] = useState(false);

  /** Current image being converted (1-indexed) */
  const [convertCurrent, setConvertCurrent] = useState(0);

  /** Total images to convert */
  const [convertTotal, setConvertTotal] = useState(0);

  /** Conversion error message */
  const [convertError, setConvertError] = useState<string | null>(null);

  /** Object URLs for thumbnail previews of input images */
  const [objectUrls, setObjectUrls] = useState<string[]>([]);

  /** Object URLs for result thumbnail previews */
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  /**
   * Create and revoke object URLs for input image thumbnails.
   * Uses useState + useEffect pattern to avoid React 18 strict mode issues.
   */
  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setObjectUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  /**
   * Create and revoke object URLs for result thumbnails.
   * Uses useState + useEffect pattern to avoid React 18 strict mode issues.
   */
  useEffect(() => {
    const urls = results.map((r) => URL.createObjectURL(r.blob));
    setResultUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [results]);

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
      if (state.file.type.startsWith('image/')) {
        setImages([state.file]);
        setResults([]);
        setConvertError(null);
      }
    }
  }, [location.state]);

  /** Cleanup on unmount: abort in-flight operations */
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  /**
   * Handle initial file selection from Upload component.
   * Resets results and error state.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    if (!files.length) return;
    setImages(files);
    setResults([]);
    setConvertError(null);
  }, []);

  /**
   * Handle additional images being added via "Add more" input.
   * Appends to the existing images array.
   */
  const handleAddMore = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImages((prev) => [...prev, ...Array.from(files)]);
    setResults([]);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, []);

  /**
   * Remove an image from the list by index.
   * Resets conversion results since the set changed.
   */
  const handleRemove = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setResults([]);
  }, []);

  /**
   * Convert all animated images to the selected target format using ffmpeg.wasm.
   * Processes images sequentially and collects results.
   *
   * Format-specific conversion strategies:
   * - GIF: Two-pass palette generation (palettegen + paletteuse)
   * - APNG: Single-pass with `-f apng -plays 0`
   * - WebP: Single-pass with `-c:v libwebp_anim -loop 0 -quality 80`
   *
   * All commands use `-threads 1` to prevent core-mt deadlocks.
   * Commands with `filter_complex` additionally use `-filter_threads 1 -filter_complex_threads 1`.
   */
  const handleConvert = useCallback(async () => {
    if (!images.length || !loaded) return;

    abortRef.current = false;
    setIsConverting(true);
    setConvertCurrent(0);
    setConvertTotal(images.length);
    setResults([]);
    setConvertError(null);

    const converted: ConvertResult[] = [];

    try {
      for (let i = 0; i < images.length; i++) {
        if (abortRef.current) return;

        setConvertCurrent(i + 1);
        const file = images[i];
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const ext = targetFormat;
        const outputName = `${baseName}.${ext}`;
        const ffmpegOutput = `output.${ext}`;

        await ffmpeg.writeFile('input', await fetchFile(file));
        if (abortRef.current) return;

        let ret: number;

        if (targetFormat === 'gif') {
          // Two-pass palette-based GIF conversion
          // Pass 1: Generate palette
          ret = await ffmpeg.exec([
            '-i', 'input',
            '-vf', 'palettegen=max_colors=256',
            '-threads', '1',
            '-y', 'palette.png',
          ]);
          if (abortRef.current) return;

          if (ret !== 0) {
            throw new Error(`ffmpeg palettegen exited with code ${ret} for ${file.name}`);
          }

          // Pass 2: Apply palette
          ret = await ffmpeg.exec([
            '-i', 'input',
            '-i', 'palette.png',
            '-filter_complex', '[0:v][1:v]paletteuse',
            '-threads', '1',
            '-filter_threads', '1',
            '-filter_complex_threads', '1',
            '-y', ffmpegOutput,
          ]);
          if (abortRef.current) return;

          if (ret !== 0) {
            throw new Error(`ffmpeg paletteuse exited with code ${ret} for ${file.name}`);
          }

          // Clean up palette temp file
          try { await ffmpeg.deleteFile('palette.png'); } catch { /* may not exist */ }
        } else if (targetFormat === 'apng') {
          // Single-pass APNG conversion
          ret = await ffmpeg.exec([
            '-i', 'input',
            '-f', 'apng',
            '-plays', '0',
            '-threads', '1',
            '-y', ffmpegOutput,
          ]);
          if (abortRef.current) return;

          if (ret !== 0) {
            throw new Error(`ffmpeg exited with code ${ret} for ${file.name}`);
          }
        } else {
          // Single-pass animated WebP conversion
          ret = await ffmpeg.exec([
            '-i', 'input',
            '-c:v', 'libwebp_anim',
            '-loop', '0',
            '-quality', '80',
            '-threads', '1',
            '-y', ffmpegOutput,
          ]);
          if (abortRef.current) return;

          if (ret !== 0) {
            throw new Error(`ffmpeg exited with code ${ret} for ${file.name}`);
          }
        }

        const data = await ffmpeg.readFile(ffmpegOutput);
        if (abortRef.current) return;

        converted.push({
          originalName: file.name,
          blob: new Blob([data], { type: MIME_MAP[targetFormat] }),
          fileName: outputName,
        });

        // Clean up ffmpeg temp files after each image to free memory
        try { await ffmpeg.deleteFile('input'); } catch { /* may not exist */ }
        try { await ffmpeg.deleteFile(ffmpegOutput); } catch { /* may not exist */ }
      }

      setResults(converted);
    } catch (err) {
      console.error('Conversion failed:', err);
      if (!abortRef.current) {
        setConvertError(t('animatedConvert.error'));
      }
    } finally {
      // Final cleanup of any remaining temp files
      try { await ffmpeg.deleteFile('input'); } catch { /* may not exist */ }
      try { await ffmpeg.deleteFile(`output.${targetFormat}`); } catch { /* may not exist */ }
      try { await ffmpeg.deleteFile('palette.png'); } catch { /* may not exist */ }

      if (!abortRef.current) {
        setIsConverting(false);
      }
    }
  }, [images, loaded, ffmpeg, targetFormat, t]);

  /**
   * Download a single converted file.
   * Creates a temporary object URL, triggers download, then revokes.
   */
  const handleDownload = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Download all converted files as a ZIP archive.
   * Uses JSZip to bundle results into a single .zip file.
   */
  const handleDownloadAll = useCallback(async () => {
    if (!results.length) return;

    const zip = new JSZip();
    results.forEach((r) => {
      zip.file(r.fileName, r.blob);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted-animated.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  /** Tools available for "Send to Tool" (exclude current tool) */
  const otherTools = TOOLS.filter((tool) => tool.id !== 'animatedConvert');

  return (
    <div className="flex flex-col gap-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('animatedConvert.title')}
      </h1>

      {/* FFmpeg loading state */}
      {!loaded && (
        <div className="rounded-xl bg-purple-50 p-4 text-center text-sm text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
          {ffmpegError || t('animatedConvert.loadingFFmpeg')}
        </div>
      )}

      {/* Upload section: shown when no images selected */}
      {images.length === 0 && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('animatedConvert.uploadPrompt')}
          </p>
          <Upload accept="image/gif,image/apng,image/png,image/webp" multiple onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* Editor section: shown after images are selected */}
      {images.length > 0 && (
        <div className="flex flex-col gap-5">
          {/* Image count and add more */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {t('animatedConvert.imageCount', { count: images.length })}
            </p>
            <button
              onClick={() => addMoreInputRef.current?.click()}
              className="rounded-xl border border-purple-300 px-4 py-1.5 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/20"
              aria-label={t('animatedConvert.addMore')}
            >
              {t('animatedConvert.addMore')}
            </button>
            <input
              ref={addMoreInputRef}
              type="file"
              accept="image/gif,image/apng,image/png,image/webp"
              multiple
              onChange={handleAddMore}
              className="hidden"
            />
          </div>

          {/* Thumbnail grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="group relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
              >
                <img
                  src={objectUrls[index] || ''}
                  alt={file.name}
                  className="aspect-square w-full object-cover"
                />
                <button
                  onClick={() => handleRemove(index)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={t('animatedConvert.removeImage')}
                >
                  x
                </button>
                <p className="truncate px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                  {file.name}
                </p>
              </div>
            ))}
          </div>

          {/* Format selector and convert button */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="target-format"
                className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {t('animatedConvert.targetFormat')}
              </label>
              <select
                id="target-format"
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as AnimatedOutputFormat)}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="gif">GIF</option>
                <option value="apng">APNG</option>
                <option value="webp">WebP</option>
              </select>
            </div>

            <button
              onClick={handleConvert}
              disabled={isConverting || !loaded || images.length === 0}
              className="rounded-xl bg-purple-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t('animatedConvert.convert')}
            >
              {isConverting
                ? t('animatedConvert.convertProgress', {
                    current: convertCurrent,
                    total: convertTotal,
                  })
                : t('animatedConvert.convert')}
            </button>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      {isConverting && (
        <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-purple-600 transition-all"
            style={{ width: `${convertTotal > 0 ? (convertCurrent / convertTotal) * 100 : 0}%` }}
            role="progressbar"
            aria-valuenow={convertCurrent}
            aria-valuemin={0}
            aria-valuemax={convertTotal}
          />
        </div>
      )}

      {/* Error alert */}
      {convertError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {convertError}
        </div>
      )}

      {/* Results section */}
      {results.length > 0 && !isConverting && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('animatedConvert.result')}
            </h2>
            <button
              onClick={handleDownloadAll}
              className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
              aria-label={t('animatedConvert.downloadAll')}
            >
              {t('animatedConvert.downloadAll')}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {results.map((result, index) => (
              <div
                key={`${result.fileName}-${index}`}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
              >
                <img
                  src={resultUrls[index] || ''}
                  alt={result.fileName}
                  className="aspect-square w-full object-cover"
                />
                <div className="flex flex-col gap-2 p-3">
                  <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                    {result.fileName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {result.originalName} &rarr; {result.fileName} ({formatSize(result.blob.size)})
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(result.blob, result.fileName)}
                      className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-700"
                      aria-label={`${t('animatedConvert.download')} ${result.fileName}`}
                    >
                      {t('animatedConvert.download')}
                    </button>
                    <div className="group relative">
                      <button
                        className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        aria-label={`${t('animatedConvert.sendToTool')} ${result.fileName}`}
                      >
                        {t('animatedConvert.sendToTool')}
                      </button>
                      <div className="absolute left-0 top-full z-10 mt-1 hidden w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg group-focus-within:block group-hover:block dark:border-gray-700 dark:bg-gray-800">
                        {otherTools.map((tool) => (
                          <Link
                            key={tool.id}
                            to={tool.path}
                            state={{ file: result.blob, fileName: result.fileName }}
                            className="block px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-purple-50 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            <span className="mr-2">{tool.icon}</span>
                            {t(`home.tools.${tool.id}.name`)}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

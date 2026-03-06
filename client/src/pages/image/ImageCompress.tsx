import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import JSZip from 'jszip';
import { Upload } from '../../components/Upload/Upload';
import { formatSize } from '../../utils/formatSize';
import { TOOLS } from '../../utils/constants';

/** Supported output formats */
type OutputFormat = 'png' | 'jpg' | 'webp' | 'original';

/** MIME type mapping for each output format */
const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** Extension mapping for each output format */
const EXT_MAP: Record<string, string> = {
  png: '.png',
  jpg: '.jpg',
  webp: '.webp',
};

/** Result item after compression */
interface CompressResult {
  /** Original file name */
  originalName: string;
  /** Original file size in bytes */
  originalSize: number;
  /** Compressed file blob */
  blob: Blob;
  /** Suggested file name for download */
  fileName: string;
}

/**
 * Detect the format key from a MIME type string.
 */
function mimeToFormat(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

/**
 * Compress a single image using the Canvas API.
 *
 * @param file - Input image file
 * @param quality - Quality 1-100 (used for JPG/WebP, ignored for PNG)
 * @param maxDimension - Max width or height in pixels (0 = no scaling)
 * @param outputFormat - Target format ('original' keeps the source format)
 * @returns Promise resolving to the compressed Blob
 */
function compressImage(
  file: File,
  quality: number,
  maxDimension: number,
  outputFormat: OutputFormat,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    /** Release Image and URL resources */
    const cleanup = () => {
      URL.revokeObjectURL(url);
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      let { width, height } = img;

      // Scale down if max dimension is set and image exceeds it
      if (maxDimension > 0 && (width > maxDimension || height > maxDimension)) {
        if (width > height) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Determine output MIME type
      const format = outputFormat === 'original' ? mimeToFormat(file.type) : outputFormat;
      const mime = MIME_MAP[format] || 'image/png';

      // Quality parameter (0-1) only applies to JPG and WebP
      const q = (format === 'jpg' || format === 'webp') ? quality / 100 : undefined;

      canvas.toBlob(
        (blob) => {
          cleanup();
          // Release canvas memory
          canvas.width = 0;
          canvas.height = 0;

          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        },
        mime,
        q,
      );
    };

    img.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = url;
  });
}

/**
 * Batch image compression page.
 * Supports PNG, JPG, and WebP with quality, max dimension, and format options.
 * Uses the Canvas API for compression — no ffmpeg needed.
 */
export function ImageCompress() {
  const { t } = useTranslation();
  const location = useLocation();

  /** Ref to track whether router state was already handled */
  const handledStateRef = useRef<File | null>(null);

  /** Ref for the hidden "add more" file input */
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  /** Ref to abort in-flight operations on unmount */
  const abortRef = useRef(false);

  // Input images
  const [images, setImages] = useState<File[]>([]);

  // Compression settings
  const [quality, setQuality] = useState<number>(80);
  const [maxDimension, setMaxDimension] = useState<number>(0);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('original');

  // Output
  const [results, setResults] = useState<CompressResult[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressCurrent, setCompressCurrent] = useState(0);
  const [compressTotal, setCompressTotal] = useState(0);
  const [compressError, setCompressError] = useState<string | null>(null);

  // Object URLs for thumbnails
  const [objectUrls, setObjectUrls] = useState<string[]>([]);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  /**
   * Create and revoke object URLs for input image thumbnails.
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
   */
  useEffect(() => {
    const urls = results.map((r) => URL.createObjectURL(r.blob));
    setResultUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [results]);

  /** Handle file from workflow (passed via router state) */
  useEffect(() => {
    const state = location.state as { file?: File; fileName?: string } | null;
    if (state?.file && state.file !== handledStateRef.current) {
      handledStateRef.current = state.file;
      if (state.file.type.startsWith('image/')) {
        setImages([state.file]);
        setResults([]);
        setCompressError(null);
      }
    }
  }, [location.state]);

  /** Cleanup on unmount */
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  /**
   * Handle initial file selection from Upload component.
   */
  const handleFileSelect = useCallback((files: File[]) => {
    if (!files.length) return;
    setImages(files);
    setResults([]);
    setCompressError(null);
  }, []);

  /**
   * Handle additional images being added via "Add more" input.
   */
  const handleAddMore = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) return;
    setImages((prev) => [...prev, ...valid]);
    setResults([]);
    e.target.value = '';
  }, []);

  /**
   * Remove an image from the list by index.
   */
  const handleRemove = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setResults([]);
  }, []);

  /**
   * Compress all images using the Canvas API.
   */
  const handleCompress = useCallback(async () => {
    if (!images.length) return;

    abortRef.current = false;
    setIsCompressing(true);
    setCompressCurrent(0);
    setCompressTotal(images.length);
    setResults([]);
    setCompressError(null);

    const compressed: CompressResult[] = [];

    try {
      for (let i = 0; i < images.length; i++) {
        if (abortRef.current) return;

        setCompressCurrent(i + 1);
        const file = images[i];

        const blob = await compressImage(file, quality, maxDimension, outputFormat);
        if (abortRef.current) return;

        // Determine output file name
        const format = outputFormat === 'original' ? mimeToFormat(file.type) : outputFormat;
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const ext = EXT_MAP[format] || '.png';
        const fileName = `${baseName}${ext}`;

        compressed.push({
          originalName: file.name,
          originalSize: file.size,
          blob,
          fileName,
        });
      }

      setResults(compressed);
    } catch (err) {
      console.error('Compression failed:', err);
      if (!abortRef.current) {
        setCompressError(t('imageCompress.error'));
      }
    } finally {
      if (!abortRef.current) {
        setIsCompressing(false);
      }
    }
  }, [images, quality, maxDimension, outputFormat, t]);

  /**
   * Download a single compressed file.
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
   * Download all compressed files as a ZIP archive.
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
    a.download = 'compressed-images.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  /**
   * Calculate savings percentage between original and compressed sizes.
   */
  const calculateSavings = (originalSize: number, compressedSize: number): string => {
    if (originalSize === 0) return '0';
    const percent = ((originalSize - compressedSize) / originalSize) * 100;
    return Math.max(0, percent).toFixed(1);
  };

  /**
   * Calculate total savings across all results.
   */
  const totalSavings = (): string => {
    if (!results.length) return '0';
    const totalOriginal = results.reduce((acc, r) => acc + r.originalSize, 0);
    const totalCompressed = results.reduce((acc, r) => acc + r.blob.size, 0);
    return calculateSavings(totalOriginal, totalCompressed);
  };

  /** Tools available for "Send to Tool" (exclude current tool) */
  const otherTools = TOOLS.filter((tool) => tool.id !== 'imageCompress');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {t('imageCompress.title')}
      </h1>

      {/* Upload section */}
      {images.length === 0 && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {t('imageCompress.uploadPrompt')}
          </p>
          <Upload accept="image/png,image/jpeg,image/webp" multiple onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* Editor section */}
      {images.length > 0 && !results.length && (
        <div className="flex flex-col gap-5">
          {/* Image count and add more */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {t('imageCompress.imageCount', { count: images.length })}
            </p>
            <button
              onClick={() => addMoreInputRef.current?.click()}
              className="rounded-xl border border-purple-300 px-4 py-1.5 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/20"
              aria-label={t('imageCompress.addMore')}
            >
              {t('imageCompress.addMore')}
            </button>
            <input
              ref={addMoreInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
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
                  aria-label={t('imageCompress.removeImage')}
                >
                  x
                </button>
                <div className="px-2 py-1">
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {formatSize(file.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Settings panel */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('imageCompress.settings')}
            </h2>

            <div className="flex flex-col gap-4">
              {/* Quality slider */}
              <div>
                <label htmlFor="compress-quality" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
                  <span>{t('imageCompress.quality')}</span>
                  <span className="text-xs text-gray-400">{t('imageCompress.qualityValue', { value: quality })}</span>
                </label>
                <input
                  id="compress-quality"
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>

              {/* Max dimension input */}
              <div>
                <label htmlFor="max-dimension" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                  {t('imageCompress.maxDimension')}
                </label>
                <input
                  id="max-dimension"
                  type="number"
                  min={0}
                  value={maxDimension}
                  onChange={(e) => setMaxDimension(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('imageCompress.maxDimensionHint')}
                </p>
              </div>

              {/* Output format selector */}
              <div>
                <label htmlFor="output-format" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
                  {t('imageCompress.outputFormat')}
                </label>
                <select
                  id="output-format"
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="original">{t('imageCompress.keepOriginal')}</option>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
            </div>
          </div>

          {/* Compress button */}
          <button
            onClick={handleCompress}
            disabled={isCompressing || images.length === 0}
            className="w-full rounded-xl bg-purple-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('imageCompress.compress')}
          >
            {isCompressing
              ? t('imageCompress.compressProgress', {
                  current: compressCurrent,
                  total: compressTotal,
                })
              : t('imageCompress.compress')}
          </button>
        </div>
      )}

      {/* Progress indicator */}
      {isCompressing && (
        <div className="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-2 rounded-full bg-purple-600 transition-all"
            style={{ width: `${compressTotal > 0 ? (compressCurrent / compressTotal) * 100 : 0}%` }}
            role="progressbar"
            aria-valuenow={compressCurrent}
            aria-valuemin={0}
            aria-valuemax={compressTotal}
            aria-label={t('imageCompress.compressProgress', { current: compressCurrent, total: compressTotal })}
          />
        </div>
      )}

      {/* Error alert */}
      {compressError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {compressError}
        </div>
      )}

      {/* Results section */}
      {results.length > 0 && !isCompressing && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('imageCompress.result')}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                {t('imageCompress.totalSavings', { percent: totalSavings() })}
              </span>
              <button
                onClick={handleDownloadAll}
                className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
                aria-label={t('imageCompress.downloadAll')}
              >
                {t('imageCompress.downloadAll')}
              </button>
            </div>
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
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      {t('imageCompress.beforeAfter', {
                        before: formatSize(result.originalSize),
                        after: formatSize(result.blob.size),
                      })}
                    </span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {t('imageCompress.savings', {
                        percent: calculateSavings(result.originalSize, result.blob.size),
                      })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(result.blob, result.fileName)}
                      className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-700"
                      aria-label={`${t('imageCompress.download')} ${result.fileName}`}
                    >
                      {t('imageCompress.download')}
                    </button>
                    <div className="group relative">
                      <button
                        className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        aria-label={`${t('imageCompress.sendToTool')} ${result.fileName}`}
                      >
                        {t('imageCompress.sendToTool')}
                      </button>
                      <div className="absolute left-0 top-full z-10 mt-1 hidden w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg group-focus-within:block group-hover:block dark:border-gray-700 dark:bg-gray-800">
                        {otherTools.map((tool) => (
                          <Link
                            key={tool.id}
                            to={tool.path}
                            state={{ file: result.blob, fileName: result.fileName }}
                            className="block px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-purple-50 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            <tool.icon size={16} weight="duotone" className="mr-2 inline-block align-text-bottom" />
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

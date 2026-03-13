import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import { formatSize } from '../../../utils/formatSize';
import type { VideoTabProps } from './index';

/** Filter state for all adjustable parameters */
interface FilterState {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  sepia: boolean;
  blur: number;
  sharpen: number;
  invert: boolean;
}

/** Default filter values (no effect) */
const DEFAULT_FILTERS: FilterState = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  grayscale: false,
  sepia: false,
  blur: 0,
  sharpen: 0,
  invert: false,
};

/**
 * Build a CSS `filter` string from filter state for live preview.
 * Sharpen has no CSS equivalent and is omitted.
 */
function buildCssFilter(f: FilterState): string {
  const parts: string[] = [];
  if (f.brightness !== 0) parts.push(`brightness(${1 + f.brightness})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
  if (f.grayscale) parts.push('grayscale(1)');
  if (f.sepia) parts.push('sepia(1)');
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.invert) parts.push('invert(1)');
  return parts.join(' ') || 'none';
}

/**
 * Build an ffmpeg `-vf` filter chain string from filter state.
 * Returns null if no filters are active.
 */
function buildFfmpegVf(f: FilterState): string | null {
  const parts: string[] = [];

  const eqParts: string[] = [];
  if (f.brightness !== 0) eqParts.push(`brightness=${f.brightness}`);
  if (f.contrast !== 1) eqParts.push(`contrast=${f.contrast}`);
  if (f.saturation !== 1) eqParts.push(`saturation=${f.saturation}`);
  if (eqParts.length > 0) parts.push(`eq=${eqParts.join(':')}`);

  if (f.grayscale) parts.push('hue=s=0');
  if (f.sepia) parts.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0');
  if (f.blur > 0) parts.push(`boxblur=${f.blur}:1`);
  if (f.sharpen > 0) parts.push(`unsharp=5:5:${f.sharpen}:5:5:${f.sharpen}`);
  if (f.invert) parts.push('negate');

  return parts.length > 0 ? parts.join(',') : null;
}

/** Check whether any filter differs from its default value */
function hasActiveFilters(f: FilterState): boolean {
  return f.brightness !== 0 || f.contrast !== 1 || f.saturation !== 1 ||
    f.grayscale || f.sepia || f.blur > 0 || f.sharpen > 0 || f.invert;
}

/**
 * Filter tab for the Video Editor.
 * Live CSS-based preview on the video element, applied via ffmpeg on submit.
 * CRITICAL: uses `-threads 1` to prevent pthread deadlock with -vf + libx264.
 */
export function FilterTab({
  videoFile,
  videoUrl,
  ffmpeg,
  ffmpegLoaded,
  isProcessing,
  onProcessStart,
  onProcessProgress,
  onProcessComplete,
  onProcessError,
}: VideoTabProps) {
  const { t } = useTranslation();
  const abortRef = useRef(false);

  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });

  /** CSS filter string for live preview */
  const cssFilter = useMemo(() => buildCssFilter(filters), [filters]);

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /** Update a single filter value */
  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Reset all filters to defaults */
  const handleResetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  /**
   * Apply filters to the video using ffmpeg.wasm.
   * CRITICAL: `-threads 1` prevents pthread deadlock with -vf + libx264.
   */
  const handleApply = useCallback(async () => {
    if (!videoFile || !ffmpegLoaded) return;

    abortRef.current = false;
    onProcessStart();

    const onProgress = ({ progress }: { progress: number }) => {
      onProcessProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    const ext = videoFile.name?.includes('.')
      ? videoFile.name.substring(videoFile.name.lastIndexOf('.'))
      : '.mp4';
    const inputName = `input${ext}`;
    const outputName = 'filtered.mp4';

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      if (abortRef.current) return;

      const args: string[] = ['-i', inputName];

      const vf = buildFfmpegVf(filters);
      if (vf) {
        args.push('-vf', vf);
      }

      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
      args.push('-c:a', 'aac', '-b:a', '128k');
      // -threads 1 prevents pthread deadlock with -vf filters + libx264
      args.push('-threads', '1');
      args.push('-y', outputName);

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;
      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      onProcessComplete(blob);
    } catch (err) {
      console.error('Filter apply failed:', err);
      if (!abortRef.current) {
        onProcessError(t('videoFilter.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
      try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
    }
  }, [videoFile, ffmpegLoaded, ffmpeg, filters, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: Video player with CSS filter preview */}
      <div className="lg:col-span-2">
        <video
          src={videoUrl}
          controls
          style={{ filter: cssFilter }}
          className="w-full rounded-xl border border-gray-200 bg-black dark:border-gray-700"
          aria-label={t('videoFilter.title')}
        />
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 px-4 py-2 dark:bg-gray-800">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {formatSize(videoFile.size)}
          </span>
        </div>
      </div>

      {/* Right: Filter settings panel */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {t('videoFilter.settings')}
        </h2>

        {/* Brightness */}
        <div>
          <label htmlFor="filter-brightness" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
            <span>{t('videoFilter.brightness')}</span>
            <span className="text-xs text-gray-400">{filters.brightness.toFixed(1)}</span>
          </label>
          <input id="filter-brightness" type="range" min={-1} max={1} step={0.1} value={filters.brightness} onChange={(e) => updateFilter('brightness', Number(e.target.value))} className="w-full accent-mint-600" />
        </div>

        {/* Contrast */}
        <div>
          <label htmlFor="filter-contrast" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
            <span>{t('videoFilter.contrast')}</span>
            <span className="text-xs text-gray-400">{filters.contrast.toFixed(1)}</span>
          </label>
          <input id="filter-contrast" type="range" min={0} max={3} step={0.1} value={filters.contrast} onChange={(e) => updateFilter('contrast', Number(e.target.value))} className="w-full accent-mint-600" />
        </div>

        {/* Saturation */}
        <div>
          <label htmlFor="filter-saturation" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
            <span>{t('videoFilter.saturation')}</span>
            <span className="text-xs text-gray-400">{filters.saturation.toFixed(1)}</span>
          </label>
          <input id="filter-saturation" type="range" min={0} max={3} step={0.1} value={filters.saturation} onChange={(e) => updateFilter('saturation', Number(e.target.value))} className="w-full accent-mint-600" />
        </div>

        {/* Grayscale */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filters.grayscale} onChange={(e) => updateFilter('grayscale', e.target.checked)} className="accent-mint-600" />
          {t('videoFilter.grayscale')}
        </label>

        {/* Sepia */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filters.sepia} onChange={(e) => updateFilter('sepia', e.target.checked)} className="accent-mint-600" />
          {t('videoFilter.sepia')}
        </label>

        {/* Blur */}
        <div>
          <label htmlFor="filter-blur" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
            <span>{t('videoFilter.blur')}</span>
            <span className="text-xs text-gray-400">{filters.blur}</span>
          </label>
          <input id="filter-blur" type="range" min={0} max={20} step={1} value={filters.blur} onChange={(e) => updateFilter('blur', Number(e.target.value))} className="w-full accent-mint-600" />
        </div>

        {/* Sharpen */}
        <div>
          <label htmlFor="filter-sharpen" className="mb-1 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-300">
            <span>
              {t('videoFilter.sharpen')}
              <span className="ml-1 text-xs text-gray-400">{t('videoFilter.sharpenNote')}</span>
            </span>
            <span className="text-xs text-gray-400">{filters.sharpen.toFixed(1)}</span>
          </label>
          <input id="filter-sharpen" type="range" min={0} max={5} step={0.1} value={filters.sharpen} onChange={(e) => updateFilter('sharpen', Number(e.target.value))} className="w-full accent-mint-600" />
        </div>

        {/* Invert */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={filters.invert} onChange={(e) => updateFilter('invert', e.target.checked)} className="accent-mint-600" />
          {t('videoFilter.invert')}
        </label>

        {/* Reset + Apply */}
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleResetFilters}
            disabled={isProcessing}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('videoFilter.reset')}
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing || !ffmpegLoaded || !hasActiveFilters(filters)}
            className="flex-1 rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('videoFilter.apply')}
          >
            {t('videoFilter.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

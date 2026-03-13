import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFile } from '@ffmpeg/util';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

/** Available speed multiplier presets */
const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3] as const;

/** Speed control mode: preset buttons or custom delay input */
type SpeedMode = 'preset' | 'custom';

/** Props shared by all GIF Editor tabs */
export interface GifTabProps {
  gifFile: File;
  gifUrl: string;
  imageWidth: number;
  imageHeight: number;
  ffmpeg: FFmpeg;
  ffmpegLoaded: boolean;
  isProcessing: boolean;
  onProcessStart: () => void;
  onProcessProgress: (progress: number) => void;
  onProcessComplete: (blob: Blob) => void;
  onProcessError: (message: string) => void;
}

/**
 * Speed adjustment tab for the GIF Editor.
 * Provides preset speed multipliers and custom frame delay input.
 */
export function SpeedTab({
  gifFile,
  gifUrl,
  ffmpeg,
  ffmpegLoaded,
  isProcessing,
  onProcessStart,
  onProcessProgress,
  onProcessComplete,
  onProcessError,
}: GifTabProps) {
  const { t } = useTranslation();
  const abortRef = useRef(false);

  const [speedMode, setSpeedMode] = useState<SpeedMode>('preset');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [customDelay, setCustomDelay] = useState<number>(100);

  /** Abort on unmount */
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  /**
   * Apply speed adjustment using ffmpeg.wasm.
   */
  const handleApply = useCallback(async () => {
    if (!gifFile || !ffmpegLoaded) return;

    abortRef.current = false;
    onProcessStart();

    const onProgress = ({ progress }: { progress: number }) => {
      onProcessProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', onProgress);

    try {
      const inputName = 'input.gif';
      const outputName = 'output.gif';

      await ffmpeg.writeFile(inputName, await fetchFile(gifFile));
      if (abortRef.current) return;

      let args: string[];

      if (speedMode === 'preset') {
        const ptsFactor = 1 / speedMultiplier;
        args = [
          '-i', inputName,
          '-filter_complex', `[0:v]setpts=${ptsFactor}*PTS[v]`,
          '-map', '[v]',
          '-threads', '1',
          '-filter_threads', '1',
          '-filter_complex_threads', '1',
          '-y', outputName,
        ];
      } else {
        const targetFps = Math.max(1, Math.min(100, 1000 / customDelay));
        args = [
          '-i', inputName,
          '-r', String(targetFps),
          '-y', outputName,
        ];
      }

      const ret = await ffmpeg.exec(args);
      if (abortRef.current) return;
      if (ret !== 0) throw new Error(`ffmpeg exited with code ${ret}`);

      const data = await ffmpeg.readFile(outputName);
      if (abortRef.current) return;

      const blob = new Blob([data as BlobPart], { type: 'image/gif' });
      onProcessComplete(blob);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error('Speed adjustment failed:', err);
      if (!abortRef.current) {
        onProcessError(t('gifSpeed.error'));
      }
    } finally {
      ffmpeg.off('progress', onProgress);
    }
  }, [gifFile, ffmpegLoaded, ffmpeg, speedMode, speedMultiplier, customDelay, onProcessStart, onProcessProgress, onProcessComplete, onProcessError, t]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: GIF preview */}
      <div className="lg:col-span-2">
        <div className="flex items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
          <img src={gifUrl} alt="preview" className="max-h-96 max-w-full object-contain" />
        </div>
      </div>

      {/* Right: Speed controls */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {t('gifSpeed.speed')}
        </h2>

        {/* Speed preset buttons */}
        <div>
          <div className="flex flex-wrap gap-2">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s}
                onClick={() => { setSpeedMultiplier(s); setSpeedMode('preset'); }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  speedMode === 'preset' && speedMultiplier === s
                    ? 'bg-mint-600 text-white'
                    : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {t('gifSpeed.speedMultiplier', { speed: s })}
              </button>
            ))}
          </div>
        </div>

        {/* Custom delay input */}
        <div>
          <label htmlFor="custom-delay" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
            {t('gifSpeed.customDelay')}
          </label>
          <input
            id="custom-delay"
            type="number"
            min={10}
            max={5000}
            value={customDelay}
            onChange={(e) => { setCustomDelay(Number(e.target.value) || 10); setSpeedMode('custom'); }}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('gifSpeed.delayMs', { delay: customDelay })}
          </p>
        </div>

        {/* Apply button */}
        <div className="mt-2">
          <button
            onClick={handleApply}
            disabled={isProcessing || !ffmpegLoaded}
            className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('gifSpeed.apply')}
          >
            {t('gifSpeed.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface TimeRangeSliderProps {
  /** Total video duration in seconds */
  duration: number;
  /** Selected start time in seconds */
  start: number;
  /** Selected end time in seconds */
  end: number;
  /** Callback when start or end changes */
  onChange: (start: number, end: number) => void;
}

/**
 * Formats seconds to mm:ss display string.
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Dual-thumb range slider for selecting a time range within a video.
 * Displays start time, end time, and selected duration.
 */
export function TimeRangeSlider({ duration, start, end, onChange }: TimeRangeSliderProps) {
  const { t } = useTranslation();
  const MIN_GAP = 0.1;

  const handleStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      const clampedStart = Math.min(value, end - MIN_GAP);
      onChange(Math.round(clampedStart * 10) / 10, end);
    },
    [end, onChange]
  );

  const handleEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      const clampedEnd = Math.max(value, start + MIN_GAP);
      onChange(start, Math.round(clampedEnd * 10) / 10);
    },
    [start, onChange]
  );

  const selectedDuration = end - start;
  const startPercent = duration > 0 ? (start / duration) * 100 : 0;
  const endPercent = duration > 0 ? (end / duration) * 100 : 100;

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <span>{t('videoToGif.timeRange')}</span>
        <span>{t('videoToGif.duration')}: <span>{formatTime(selectedDuration)}</span></span>
      </div>

      <div className="relative h-8">
        {/* Track background */}
        <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700" />

        {/* Selected range highlight */}
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-purple-400 dark:bg-purple-600"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        />

        {/* Start slider */}
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={start}
          onChange={handleStartChange}
          className="pointer-events-none absolute top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600 [&::-webkit-slider-thumb]:shadow-md"
          aria-label={t('videoToGif.start')}
        />

        {/* End slider */}
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={end}
          onChange={handleEndChange}
          className="pointer-events-none absolute top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600 [&::-webkit-slider-thumb]:shadow-md"
          aria-label={t('videoToGif.end')}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{formatTime(start)}</span>
        <span>{formatTime(end)}</span>
      </div>
    </div>
  );
}

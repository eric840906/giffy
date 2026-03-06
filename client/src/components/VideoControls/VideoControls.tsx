import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

interface VideoControlsProps {
  /** Ref to the video element to control */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Called after the current time changes (seek or playback), so the parent can re-extract the frame */
  onTimeChange: () => void;
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
 * Custom video playback controls with play/pause, seek slider, and time display.
 * Designed for use where native video controls are not accessible (e.g. behind an overlay).
 */
export function VideoControls({ videoRef, onTimeChange }: VideoControlsProps) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number>(0);

  /**
   * Sync playback state from the video element's events.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    // If metadata is already loaded
    if (video.duration) {
      setDuration(video.duration);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoRef]);

  /**
   * During playback, update currentTime and re-extract frames via requestAnimationFrame.
   */
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const video = videoRef.current;
      if (video) {
        setCurrentTime(video.currentTime);
        onTimeChange();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, videoRef, onTimeChange]);

  /** Toggle play/pause */
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, [videoRef]);

  /** Handle seek slider input */
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      if (!video) return;

      const time = parseFloat(e.target.value);
      video.currentTime = time;
      setCurrentTime(time);
      onTimeChange();
    },
    [videoRef, onTimeChange]
  );

  const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3" data-testid="video-controls">
      {/* Play/Pause button */}
      <button
        onClick={handleTogglePlay}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-600 text-white transition-colors hover:bg-mint-700"
        aria-label={isPlaying ? t('videoCrop.pause') : t('videoCrop.play')}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3 1.5v11l9-5.5z" />
          </svg>
        )}
      </button>

      {/* Seek slider */}
      <div className="relative flex-1 h-8">
        {/* Track background */}
        <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700" />

        {/* Progress fill */}
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-mint-400 dark:bg-mint-600"
          style={{ width: `${percent}%` }}
        />

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="absolute top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-mint-600 [&::-webkit-slider-thumb]:shadow-md"
          aria-label="Seek"
        />
      </div>

      {/* Time display */}
      <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}

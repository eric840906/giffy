import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { FrameData } from '../FrameGrid/FrameGrid';

interface FramePreviewProps {
  /** Ordered list of frames to preview */
  frames: FrameData[];
  /** Number of loops to play (0 = infinite) */
  loopCount: number;
}

/**
 * Canvas-based animated preview for frame sequences.
 * Draws frames to a canvas element respecting per-frame delays.
 * Supports play/pause, step-forward, step-backward, and loop count.
 */
export function FramePreview({ frames, loopCount }: FramePreviewProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bitmapsRef = useRef<ImageBitmap[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loopsCompleted, setLoopsCompleted] = useState(0);

  /** Track whether the component is mounted to avoid state updates after unmount */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Create ImageBitmaps from frame blobs for efficient canvas rendering.
   * Close previous bitmaps on cleanup.
   */
  useEffect(() => {
    let cancelled = false;

    const createBitmaps = async () => {
      const newBitmaps: ImageBitmap[] = [];
      for (const frame of frames) {
        if (cancelled) break;
        try {
          const bitmap = await createImageBitmap(frame.blob);
          newBitmaps.push(bitmap);
        } catch {
          // Skip frames that fail to decode
        }
      }
      if (!cancelled) {
        // Close old bitmaps
        bitmapsRef.current.forEach((b) => b.close());
        bitmapsRef.current = newBitmaps;
        // Draw first frame
        if (newBitmaps.length > 0 && mountedRef.current) {
          drawFrame(0, newBitmaps);
        }
      } else {
        newBitmaps.forEach((b) => b.close());
      }
    };

    if (frames.length > 0) {
      createBitmaps();
    }

    return () => {
      cancelled = true;
    };
  }, [frames]);

  /** Cleanup bitmaps and timer on unmount */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      bitmapsRef.current.forEach((b) => b.close());
      bitmapsRef.current = [];
    };
  }, []);

  /**
   * Draw a specific frame to the canvas.
   * Sizes canvas to the bitmap dimensions.
   */
  const drawFrame = useCallback((index: number, bitmaps?: ImageBitmap[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const allBitmaps = bitmaps || bitmapsRef.current;
    if (index < 0 || index >= allBitmaps.length) return;

    const bitmap = allBitmaps[index];
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  }, []);

  /**
   * Schedule the next frame in the animation loop.
   * Respects per-frame delays and loop count.
   */
  const scheduleNext = useCallback(
    (index: number, loops: number) => {
      if (!mountedRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);

      const delay = frames[index]?.delay ?? 100;

      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;

        let nextIndex = index + 1;
        let nextLoops = loops;

        if (nextIndex >= frames.length) {
          nextLoops += 1;
          // Check if we should stop
          if (loopCount > 0 && nextLoops >= loopCount) {
            setIsPlaying(false);
            setLoopsCompleted(nextLoops);
            return;
          }
          nextIndex = 0;
        }

        setCurrentIndex(nextIndex);
        setLoopsCompleted(nextLoops);
        drawFrame(nextIndex);
        scheduleNext(nextIndex, nextLoops);
      }, delay);
    },
    [frames, loopCount, drawFrame],
  );

  /** Start or resume playback */
  const handlePlay = useCallback(() => {
    if (frames.length === 0 || bitmapsRef.current.length === 0) return;
    setIsPlaying(true);
    setLoopsCompleted(0);
    drawFrame(currentIndex);
    scheduleNext(currentIndex, 0);
  }, [frames.length, currentIndex, drawFrame, scheduleNext]);

  /** Pause playback */
  const handlePause = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Step forward one frame */
  const handleStepForward = useCallback(() => {
    if (frames.length === 0) return;
    handlePause();
    const next = (currentIndex + 1) % frames.length;
    setCurrentIndex(next);
    drawFrame(next);
  }, [frames.length, currentIndex, handlePause, drawFrame]);

  /** Step backward one frame */
  const handleStepBackward = useCallback(() => {
    if (frames.length === 0) return;
    handlePause();
    const prev = (currentIndex - 1 + frames.length) % frames.length;
    setCurrentIndex(prev);
    drawFrame(prev);
  }, [frames.length, currentIndex, handlePause, drawFrame]);

  /** Stop timer when frames change */
  useEffect(() => {
    if (isPlaying) {
      handlePause();
    }
    setCurrentIndex(0);
    setLoopsCompleted(0);
  }, [frames]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {t('frameEditor.preview')}
      </h3>

      {/* Canvas */}
      <div className="flex items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900">
        <canvas
          ref={canvasRef}
          className="max-h-64 max-w-full object-contain"
          role="img"
          aria-label={t('frameEditor.preview')}
        />
      </div>

      {/* Frame indicator */}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t('frameEditor.currentFrame', {
          current: frames.length > 0 ? currentIndex + 1 : 0,
          total: frames.length,
        })}
      </p>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleStepBackward}
          disabled={frames.length === 0}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label={t('frameEditor.stepBackward')}
        >
          ⏮
        </button>

        {isPlaying ? (
          <button
            onClick={handlePause}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            aria-label={t('frameEditor.pause')}
          >
            {t('frameEditor.pause')}
          </button>
        ) : (
          <button
            onClick={handlePlay}
            disabled={frames.length === 0}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('frameEditor.play')}
          >
            {t('frameEditor.play')}
          </button>
        )}

        <button
          onClick={handleStepForward}
          disabled={frames.length === 0}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label={t('frameEditor.stepForward')}
        >
          ⏭
        </button>
      </div>
    </div>
  );
}

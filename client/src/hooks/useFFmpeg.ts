import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/**
 * Hook for managing ffmpeg.wasm lifecycle.
 * Loads ffmpeg-core from /public/ffmpeg/ (same origin) to avoid
 * cross-origin issues with CDN + COEP headers.
 *
 * @returns An object containing:
 *   - ffmpeg: The FFmpeg instance
 *   - loaded: Whether ffmpeg has been loaded successfully
 *   - loading: Whether ffmpeg is currently loading
 *   - progress: Loading progress percentage (0-100)
 *   - load: Function to trigger ffmpeg loading
 */
export function useFFmpeg() {
  const ffmpegRef = useRef(new FFmpeg());
  const loadingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Loads ffmpeg.wasm from same-origin /ffmpeg/ path.
   * No-ops if already loaded or currently loading.
   * Uses a ref guard to prevent duplicate calls (React strict mode).
   * Sets error state if loading fails.
   */
  const load = useCallback(async () => {
    if (loaded || loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setProgress(0);
    setError(null);

    const ffmpeg = ffmpegRef.current;

    try {
      const baseURL = window.location.origin + '/ffmpeg';
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        'application/wasm',
        true,
        (e: { received: number; total: number }) => {
          if (e.total > 0) setProgress(Math.round((e.received / e.total) * 100));
        },
      );

      await ffmpeg.load({ coreURL, wasmURL });
      setLoaded(true);
      setProgress(100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load ffmpeg';
      setError(message);
      console.error('[ffmpeg] FAILED to load:', err);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [loaded]);

  return {
    ffmpeg: ffmpegRef.current,
    loaded,
    loading,
    progress,
    error,
    load,
  };
}

import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * Hook for managing ffmpeg.wasm lifecycle.
 * Loads ffmpeg-core from /public/ffmpeg/ (same origin).
 *
 * @returns An object containing:
 *   - ffmpeg: The FFmpeg instance
 *   - loaded: Whether ffmpeg has been loaded successfully
 *   - loading: Whether ffmpeg is currently loading
 *   - load: Function to trigger ffmpeg loading
 */
export function useFFmpeg() {
  const ffmpegRef = useRef(new FFmpeg());
  const loadingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Loads ffmpeg.wasm from same-origin /ffmpeg/ path.
   * Uses a ref guard to prevent duplicate calls (React strict mode).
   */
  const load = useCallback(async () => {
    if (loaded || loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      await ffmpegRef.current.load({
        coreURL: '/ffmpeg/ffmpeg-core.js',
        wasmURL: '/ffmpeg/ffmpeg-core.wasm',
        classWorkerURL: '/ffmpeg/ffmpeg-worker.js',
      });
      setLoaded(true);
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
    error,
    load,
  };
}

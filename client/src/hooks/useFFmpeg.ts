import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * Cache-busting version for /public/ffmpeg/ assets.
 * Bump this after replacing any file in public/ffmpeg/ to bypass browser cache.
 */
const FFMPEG_ASSET_VERSION = '0.12.6-v2';

/**
 * Hook for managing ffmpeg.wasm lifecycle.
 * Loads @ffmpeg/core-mt@0.12.6 (multi-thread build) from /public/ffmpeg/ (same origin).
 * Note: 0.12.10 has a larger stack but breaks video filters (palettegen, filter_complex).
 * Requires SharedArrayBuffer (COOP/COEP headers set by the server).
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
   * Loads ffmpeg.wasm (multi-thread build, v0.12.6) from same-origin /ffmpeg/ path.
   * Uses a ref guard to prevent duplicate calls (React strict mode).
   */
  const load = useCallback(async () => {
    if (loaded || loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const v = FFMPEG_ASSET_VERSION;
      await ffmpegRef.current.load({
        coreURL: `/ffmpeg/ffmpeg-core.js?v=${v}`,
        wasmURL: `/ffmpeg/ffmpeg-core.wasm?v=${v}`,
        workerURL: `/ffmpeg/ffmpeg-core.worker.js?v=${v}`,
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

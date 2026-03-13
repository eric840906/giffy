import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * Cache-busting version for /public/ffmpeg/ assets.
 * Bump this after replacing any file in public/ffmpeg/ to bypass browser cache.
 */
const FFMPEG_ASSET_VERSION = '0.12.6-v2';

/**
 * Fetches a URL with download progress tracking via ReadableStream.
 * Returns a blob URL that can be passed to ffmpeg.load().
 */
async function fetchWithProgress(
  url: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  const response = await fetch(url);
  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body || !total) {
    // Fallback: no streaming or unknown size — return original URL
    return url;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.round((received / total) * 100));
  }

  const blob = new Blob(chunks as BlobPart[], { type: 'application/wasm' });
  return URL.createObjectURL(blob);
}

/**
 * Hook for managing ffmpeg.wasm lifecycle.
 * Loads @ffmpeg/core-mt@0.12.6 (multi-thread build) from /public/ffmpeg/ (same origin).
 * Pre-fetches the .wasm file (~32MB) with progress tracking.
 * Requires SharedArrayBuffer (COOP/COEP headers set by the server).
 *
 * @returns An object containing:
 *   - ffmpeg: The FFmpeg instance
 *   - loaded: Whether ffmpeg has been loaded successfully
 *   - loading: Whether ffmpeg is currently loading
 *   - progress: Download progress (0–100)
 *   - error: Error message if load failed
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
   * Loads ffmpeg.wasm (multi-thread build, v0.12.6) from same-origin /ffmpeg/ path.
   * Downloads the .wasm file with progress tracking, then passes it as a blob URL.
   * Uses a ref guard to prevent duplicate calls (React strict mode).
   */
  const load = useCallback(async () => {
    if (loaded || loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setProgress(0);
    setError(null);

    try {
      const v = FFMPEG_ASSET_VERSION;
      const base = import.meta.env.BASE_URL;

      // Pre-fetch the wasm file (~32MB) with progress tracking
      const wasmBlobURL = await fetchWithProgress(
        `${base}ffmpeg/ffmpeg-core.wasm?v=${v}`,
        setProgress,
      );

      await ffmpegRef.current.load({
        coreURL: `${base}ffmpeg/ffmpeg-core.js?v=${v}`,
        wasmURL: wasmBlobURL,
        workerURL: `${base}ffmpeg/ffmpeg-core.worker.js?v=${v}`,
        classWorkerURL: `${base}ffmpeg/ffmpeg-worker.js`,
      });

      // Clean up blob URL if we created one
      if (wasmBlobURL.startsWith('blob:')) {
        URL.revokeObjectURL(wasmBlobURL);
      }

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
    progress,
    error,
    load,
  };
}

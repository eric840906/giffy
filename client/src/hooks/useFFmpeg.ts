import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/**
 * Hook for managing ffmpeg.wasm lifecycle.
 * Handles loading with progress tracking and exposes the FFmpeg instance.
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
   * Loads ffmpeg.wasm from the unpkg CDN.
   * No-ops if already loaded or currently loading.
   * Uses a ref guard to prevent duplicate calls (React strict mode).
   * Updates progress state during download (~30MB).
   * Sets error state if loading fails.
   */
  const load = useCallback(async () => {
    if (loaded || loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setProgress(0);
    setError(null);

    const ffmpeg = ffmpegRef.current;

    /** Track download progress across both files (~32MB total, wasm is ~99%) */
    const onDownloadProgress = ({ received, total }: { url: string; received: number; total: number }) => {
      if (total > 0) {
        setProgress(Math.round((received / total) * 100));
      }
    };

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

      console.log('[ffmpeg] downloading core JS...');
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      console.log('[ffmpeg] core JS ready');

      console.log('[ffmpeg] downloading WASM (~32MB)...');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm', onDownloadProgress);
      console.log('[ffmpeg] WASM ready');

      console.log('[ffmpeg] calling ffmpeg.load()...');
      await ffmpeg.load({ coreURL, wasmURL });
      console.log('[ffmpeg] loaded successfully!');
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

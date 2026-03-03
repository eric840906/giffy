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
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Loads ffmpeg.wasm from the unpkg CDN.
   * No-ops if already loaded or currently loading.
   * Updates progress state during download (~30MB).
   * Sets error state if loading fails.
   */
  const load = useCallback(async () => {
    if (loaded || loading) return;

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

      // Download core JS first (~114KB, fast)
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');

      // Download WASM (~32MB, slow — show progress)
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm', onDownloadProgress);

      await ffmpeg.load({ coreURL, wasmURL });
      setLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load ffmpeg';
      setError(message);
      console.error('Failed to load ffmpeg:', err);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  return {
    ffmpeg: ffmpegRef.current,
    loaded,
    loading,
    progress,
    error,
    load,
  };
}

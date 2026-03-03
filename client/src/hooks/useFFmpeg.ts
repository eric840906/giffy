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

  /**
   * Loads ffmpeg.wasm from the unpkg CDN.
   * No-ops if already loaded or currently loading.
   * Updates progress state during download (~30MB).
   */
  const load = useCallback(async () => {
    if (loaded || loading) return;

    setLoading(true);
    setProgress(0);

    const ffmpeg = ffmpegRef.current;

    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.round(p * 100));
    });

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load ffmpeg:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  return {
    ffmpeg: ffmpegRef.current,
    loaded,
    loading,
    progress,
    load,
  };
}

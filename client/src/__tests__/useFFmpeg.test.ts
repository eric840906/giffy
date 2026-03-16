import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';

// Mock @ffmpeg/ffmpeg before import
vi.mock('@ffmpeg/ffmpeg', () => {
  const FFmpeg = vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.off = vi.fn();
    this.load = vi.fn().mockResolvedValue(undefined);
    this.loaded = false;
  });
  return { FFmpeg };
});

import { useFFmpeg, FFmpegProvider } from '../hooks/useFFmpeg';

function wrapper({ children }: { children: ReactNode }) {
  return FFmpegProvider({ children });
}

describe('useFFmpeg', () => {
  it('initializes with not loaded state', () => {
    const { result } = renderHook(() => useFFmpeg(), { wrapper });
    expect(result.current.loaded).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('exposes load function', () => {
    const { result } = renderHook(() => useFFmpeg(), { wrapper });
    expect(typeof result.current.load).toBe('function');
  });

  it('exposes ffmpeg instance', () => {
    const { result } = renderHook(() => useFFmpeg(), { wrapper });
    expect(result.current.ffmpeg).toBeDefined();
  });

  it('exposes error state as null initially', () => {
    const { result } = renderHook(() => useFFmpeg(), { wrapper });
    expect(result.current.error).toBeNull();
  });

  it('exposes progress state as 0 initially', () => {
    const { result } = renderHook(() => useFFmpeg(), { wrapper });
    expect(result.current.progress).toBe(0);
  });
});

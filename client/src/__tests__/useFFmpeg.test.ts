import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock @ffmpeg/ffmpeg before import
vi.mock('@ffmpeg/ffmpeg', () => {
  const FFmpeg = vi.fn(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.load = vi.fn().mockResolvedValue(undefined);
    this.loaded = false;
  });
  return { FFmpeg };
});

vi.mock('@ffmpeg/util', () => {
  return {
    toBlobURL: vi.fn().mockResolvedValue('blob:mock-url'),
  };
});

import { useFFmpeg } from '../hooks/useFFmpeg';

describe('useFFmpeg', () => {
  it('initializes with not loaded state', () => {
    const { result } = renderHook(() => useFFmpeg());
    expect(result.current.loaded).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.progress).toBe(0);
  });

  it('exposes load function', () => {
    const { result } = renderHook(() => useFFmpeg());
    expect(typeof result.current.load).toBe('function');
  });

  it('exposes ffmpeg instance', () => {
    const { result } = renderHook(() => useFFmpeg());
    expect(result.current.ffmpeg).toBeDefined();
  });
});

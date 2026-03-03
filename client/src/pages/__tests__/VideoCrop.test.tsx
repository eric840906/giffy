import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { VideoCrop } from '../video/VideoCrop';

vi.mock('../../hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    ffmpeg: {
      writeFile: vi.fn(),
      exec: vi.fn(),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([0])),
      deleteFile: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    loaded: true,
    loading: false,
    error: null,
    load: vi.fn(),
  }),
}));

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([0])),
}));

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

/**
 * Renders the VideoCrop page inside a MemoryRouter for testing.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <VideoCrop />
    </MemoryRouter>
  );
}

describe('VideoCrop', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('影片裁切（畫面）')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('hides upload after file is selected', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.queryByText('上傳影片以裁切畫面區域')).not.toBeInTheDocument();
  });

  it('shows video element after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });
    // After upload, a hidden video element should exist for frame extraction
    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
  });
});

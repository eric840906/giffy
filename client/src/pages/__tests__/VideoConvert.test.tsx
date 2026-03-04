import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { VideoConvert } from '../video/VideoConvert';

vi.mock('../../hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    ffmpeg: {
      writeFile: vi.fn(),
      exec: vi.fn(),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([0, 0, 0])),
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
 * Helper to render VideoConvert inside a router context.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <VideoConvert />
    </MemoryRouter>
  );
}

/**
 * Helper to upload a mock video file.
 * Returns the file input element for further assertions.
 */
function uploadVideoFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['video-content'], 'test.mp4', { type: 'video/mp4' });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

describe('VideoConvert', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('影片轉檔')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows MP4 format label after file upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByText('MP4')).toBeInTheDocument();
  });

  it('shows convert button after file upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByRole('button', { name: /轉換/ })).toBeInTheDocument();
  });

  it('hides upload prompt after file selected', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.queryByText('上傳影片以轉換格式')).not.toBeInTheDocument();
  });

  it('shows advanced options toggle', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByText('進階選項')).toBeInTheDocument();
  });

  it('shows original file info after upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByText('原始資訊')).toBeInTheDocument();
    expect(screen.getByText('13 B')).toBeInTheDocument();
  });

  it('shows MP4 as the output format', () => {
    renderPage();
    uploadVideoFile();

    const mp4Label = screen.getByText('MP4');
    expect(mp4Label.className).toContain('bg-purple-600');
  });
});

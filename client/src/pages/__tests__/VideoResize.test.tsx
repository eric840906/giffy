import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { VideoResize } from '../video/VideoResize';

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
 * Helper to render VideoResize inside a router context.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <VideoResize />
    </MemoryRouter>
  );
}

/**
 * Helper to upload a mock video file.
 */
function uploadVideoFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['video-content'], 'test.mp4', { type: 'video/mp4' });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

describe('VideoResize', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('影片調整大小')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('hides upload after file selected', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.queryByText('上傳影片以調整解析度')).not.toBeInTheDocument();
  });

  it('shows preset resolution options after upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByText('預設大小')).toBeInTheDocument();
    expect(screen.getByLabelText(/原始/)).toBeInTheDocument();
    expect(screen.getByLabelText(/1080p/)).toBeInTheDocument();
    expect(screen.getByLabelText(/720p/)).toBeInTheDocument();
    expect(screen.getByLabelText(/480p/)).toBeInTheDocument();
    expect(screen.getByLabelText(/自訂/)).toBeInTheDocument();
  });

  it('shows resize button after upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByRole('button', { name: /調整大小/ })).toBeInTheDocument();
  });

  it('shows width/height inputs when custom is selected', () => {
    renderPage();
    uploadVideoFile();

    // Select custom preset
    fireEvent.click(screen.getByLabelText(/自訂/));

    expect(screen.getByLabelText(/寬度/)).toBeInTheDocument();
    expect(screen.getByLabelText(/高度/)).toBeInTheDocument();
  });

  it('shows lock aspect ratio checkbox when custom is selected', () => {
    renderPage();
    uploadVideoFile();

    fireEvent.click(screen.getByLabelText(/自訂/));

    expect(screen.getByLabelText(/鎖定比例/)).toBeInTheDocument();
  });
});

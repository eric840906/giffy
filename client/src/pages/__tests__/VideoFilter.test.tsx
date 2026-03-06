import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { VideoFilter } from '../video/VideoFilter';

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
 * Helper to render VideoFilter inside a router context.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <VideoFilter />
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

describe('VideoFilter', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('影片加濾鏡')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows upload prompt text', () => {
    renderPage();
    expect(screen.getByText('上傳影片以套用視覺濾鏡')).toBeInTheDocument();
  });

  it('hides upload after file selected', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.queryByText('上傳影片以套用視覺濾鏡')).not.toBeInTheDocument();
  });

  it('shows file info bar after selection', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByText('test.mp4')).toBeInTheDocument();
  });

  it('shows change file button', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByText('更換檔案')).toBeInTheDocument();
  });

  it('shows brightness, contrast, saturation sliders after upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByLabelText(/亮度/)).toBeInTheDocument();
    expect(screen.getByLabelText(/對比度/)).toBeInTheDocument();
    expect(screen.getByLabelText(/飽和度/)).toBeInTheDocument();
  });

  it('shows grayscale, sepia, invert toggles after upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByLabelText(/灰階/)).toBeInTheDocument();
    expect(screen.getByLabelText(/復古/)).toBeInTheDocument();
    expect(screen.getByLabelText(/反轉色/)).toBeInTheDocument();
  });

  it('shows blur and sharpen sliders after upload', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByLabelText(/模糊/)).toBeInTheDocument();
    expect(screen.getByLabelText(/銳化/)).toBeInTheDocument();
  });

  it('shows reset button', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByText('重設')).toBeInTheDocument();
  });

  it('shows apply button', () => {
    renderPage();
    uploadVideoFile();

    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();
  });

  it('applies CSS filter style to video player', () => {
    renderPage();
    uploadVideoFile();

    const video = screen.getByLabelText('影片加濾鏡') as HTMLVideoElement;
    // Default filters → 'none'
    expect(video.style.filter).toBe('none');

    // Change brightness via slider
    const brightnessSlider = screen.getByLabelText(/亮度/) as HTMLInputElement;
    fireEvent.change(brightnessSlider, { target: { value: '0.5' } });

    expect(video.style.filter).toContain('brightness(1.5)');
  });
});

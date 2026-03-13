import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { VideoEditor } from '../video/VideoEditor';

vi.mock('../../hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    ffmpeg: {
      writeFile: vi.fn(),
      exec: vi.fn().mockResolvedValue(0),
      readFile: vi.fn().mockRejectedValue(new Error('File not found')),
      deleteFile: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    loaded: true,
    loading: false,
    error: null,
    progress: 100,
    load: vi.fn(),
  }),
}));

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([0])),
}));

// Mock CropOverlay to avoid canvas complexity in tests
vi.mock('../../components/CropOverlay/CropOverlay', () => ({
  CropOverlay: ({ src, crop }: any) => (
    <div data-testid="crop-overlay" data-src={src}>
      Crop: {crop.width}x{crop.height}
    </div>
  ),
}));

// Mock VideoControls
vi.mock('../../components/VideoControls/VideoControls', () => ({
  VideoControls: () => <div data-testid="video-controls">VideoControls</div>,
}));

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

/** Render VideoEditor inside a router context */
function renderPage() {
  return render(
    <MemoryRouter>
      <VideoEditor />
    </MemoryRouter>,
  );
}

/** Upload a file */
function uploadFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['video-content'], 'test.mp4', { type: 'video/mp4' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('VideoEditor', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('影片編輯器')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('renders upload prompt', () => {
    renderPage();
    expect(screen.getByText(/上傳影片開始編輯/)).toBeInTheDocument();
  });

  it('shows file info bar after file upload', () => {
    renderPage();
    uploadFile();

    expect(screen.getByText('test.mp4')).toBeInTheDocument();
    expect(screen.getByText('更換檔案')).toBeInTheDocument();
  });

  it('hides upload after file is selected', () => {
    renderPage();
    uploadFile();

    expect(screen.queryByText('拖放檔案到這裡')).not.toBeInTheDocument();
  });

  it('shows tab navigation after file upload', () => {
    renderPage();
    uploadFile();

    expect(screen.getByRole('tab', { name: '時間裁切' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '畫面裁切' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '調整大小' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '濾鏡特效' })).toBeInTheDocument();
  });

  it('defaults to trim tab', () => {
    renderPage();
    uploadFile();

    const trimTab = screen.getByRole('tab', { name: '時間裁切' });
    expect(trimTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to crop tab', () => {
    renderPage();
    uploadFile();

    fireEvent.click(screen.getByRole('tab', { name: '畫面裁切' }));

    const cropTab = screen.getByRole('tab', { name: '畫面裁切' });
    expect(cropTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to resize tab', () => {
    renderPage();
    uploadFile();

    fireEvent.click(screen.getByRole('tab', { name: '調整大小' }));

    const resizeTab = screen.getByRole('tab', { name: '調整大小' });
    expect(resizeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to filter tab', () => {
    renderPage();
    uploadFile();

    fireEvent.click(screen.getByRole('tab', { name: '濾鏡特效' }));

    const filterTab = screen.getByRole('tab', { name: '濾鏡特效' });
    expect(filterTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('濾鏡設定')).toBeInTheDocument();
  });

  it('shows trim button on trim tab', () => {
    renderPage();
    uploadFile();

    expect(screen.getByRole('button', { name: /裁切/ })).toBeInTheDocument();
  });

  it('shows apply button on filter tab', () => {
    renderPage();
    uploadFile();

    fireEvent.click(screen.getByRole('tab', { name: '濾鏡特效' }));
    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();
  });
});

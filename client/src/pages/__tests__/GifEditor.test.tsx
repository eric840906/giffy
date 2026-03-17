import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GifEditor } from '../gif/GifEditor';

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

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

/** Render GifEditor inside a router context */
function renderPage() {
  return render(
    <MemoryRouter>
      <GifEditor />
    </MemoryRouter>,
  );
}

/** Upload a file and trigger image load to enable tabs */
function uploadFileAndLoadImage() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
  fireEvent.change(input, { target: { files: [file] } });

  // Find the hidden image for dimension detection
  const hiddenImg = document.querySelector('img.absolute.opacity-0') as HTMLImageElement;
  if (hiddenImg) {
    Object.defineProperty(hiddenImg, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(hiddenImg, 'naturalHeight', { value: 150, configurable: true });
    fireEvent.load(hiddenImg);
  }
}

describe('GifEditor', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('GIF 編輯器')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('renders upload prompt', () => {
    renderPage();
    expect(screen.getByText(/上傳 GIF/)).toBeInTheDocument();
  });

  it('shows file info bar after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('test.gif')).toBeInTheDocument();
    expect(screen.getByText('更換檔案')).toBeInTheDocument();
  });

  it('hides upload after file is selected', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.queryByText('拖放檔案到這裡')).not.toBeInTheDocument();
  });

  it('shows tab navigation after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByRole('tab', { name: '裁切' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '縮放' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '速度調整' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '壓縮' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '加文字' })).toBeInTheDocument();
  });

  it('defaults to crop tab', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    const cropTab = screen.getByRole('tab', { name: '裁切' });
    expect(cropTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows crop settings on crop tab with loaded image', () => {
    renderPage();
    uploadFileAndLoadImage();

    expect(screen.getByText('裁切區域')).toBeInTheDocument();
    expect(screen.getByLabelText('X 位置')).toBeInTheDocument();
  });

  it('switches to speed tab', () => {
    renderPage();
    uploadFileAndLoadImage();

    fireEvent.click(screen.getByRole('tab', { name: '速度調整' }));

    const speedTab = screen.getByRole('tab', { name: '速度調整' });
    expect(speedTab).toHaveAttribute('aria-selected', 'true');

    // Speed presets should be visible
    expect(screen.getByText('1x')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
  });

  it('switches to compress tab', () => {
    renderPage();
    uploadFileAndLoadImage();

    fireEvent.click(screen.getByRole('tab', { name: '壓縮' }));

    const compressTab = screen.getByRole('tab', { name: '壓縮' });
    expect(compressTab).toHaveAttribute('aria-selected', 'true');

    // Compression settings should be visible
    expect(screen.getByText('壓縮設定')).toBeInTheDocument();
    expect(screen.getByLabelText('色彩數量')).toBeInTheDocument();
  });

  it('switches to text tab', () => {
    renderPage();
    uploadFileAndLoadImage();

    fireEvent.click(screen.getByRole('tab', { name: '加文字' }));

    const textTab = screen.getByRole('tab', { name: '加文字' });
    expect(textTab).toHaveAttribute('aria-selected', 'true');

    // Text settings should be visible
    expect(screen.getByText('文字設定')).toBeInTheDocument();
    expect(screen.getByText(/新增文字/)).toBeInTheDocument();
  });

  it('preserves tab state when switching tabs', () => {
    renderPage();
    uploadFileAndLoadImage();

    // Switch to speed tab
    fireEvent.click(screen.getByRole('tab', { name: '速度調整' }));
    // Click 2x speed
    const twoXBtn = screen.getByText('2x');
    fireEvent.click(twoXBtn);
    expect(twoXBtn.className).toContain('bg-mint-600');

    // Switch to crop tab and back
    fireEvent.click(screen.getByRole('tab', { name: '裁切' }));
    fireEvent.click(screen.getByRole('tab', { name: '速度調整' }));

    // 2x should still be selected
    const twoXBtnAfter = screen.getByText('2x');
    expect(twoXBtnAfter.className).toContain('bg-mint-600');
  });

  it('shows apply button on each tab', () => {
    renderPage();
    uploadFileAndLoadImage();

    // Crop tab: apply button
    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();

    // Resize tab: apply button
    fireEvent.click(screen.getByRole('tab', { name: '縮放' }));
    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();

    // Speed tab: apply button
    fireEvent.click(screen.getByRole('tab', { name: '速度調整' }));
    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();

    // Compress tab: compress button
    fireEvent.click(screen.getByRole('tab', { name: '壓縮' }));
    expect(screen.getByRole('button', { name: /壓縮/ })).toBeInTheDocument();

    // Text tab: apply button
    fireEvent.click(screen.getByRole('tab', { name: '加文字' }));
    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();
  });
});

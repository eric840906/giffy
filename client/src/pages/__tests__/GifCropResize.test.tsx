import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GifCropResize } from '../gif/GifCropResize';

vi.mock('../../hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    ffmpeg: {
      writeFile: vi.fn(),
      exec: vi.fn(),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([71, 73, 70])),
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

// Mock CropOverlay to avoid canvas complexity in tests
vi.mock('../../components/CropOverlay/CropOverlay', () => ({
  CropOverlay: ({ src, crop, onChange }: any) => (
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

function renderPage() {
  return render(
    <MemoryRouter>
      <GifCropResize />
    </MemoryRouter>
  );
}

describe('GifCropResize', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('GIF 裁切/縮放')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows settings panel after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('輸出設定')).toBeInTheDocument();
    expect(screen.getByLabelText(/寬度/)).toBeInTheDocument();
    expect(screen.getByLabelText(/高度/)).toBeInTheDocument();
  });

  it('shows apply button after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();
  });

  it('hides upload after file is selected', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.queryByText('拖放檔案到這裡')).not.toBeInTheDocument();
  });
});

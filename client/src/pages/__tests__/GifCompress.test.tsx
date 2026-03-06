import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GifCompress } from '../gif/GifCompress';

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

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

/**
 * Helper to render GifCompress inside a router context.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <GifCompress />
    </MemoryRouter>
  );
}

/**
 * Helper to render the page and upload a file.
 * Returns the rendered result after file selection.
 */
function renderPageWithFile() {
  renderPage();
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('GifCompress', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('GIF 壓縮/優化')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows settings after file upload', () => {
    renderPageWithFile();

    // Settings heading
    expect(screen.getByText('壓縮設定')).toBeInTheDocument();
    // Colors slider
    expect(screen.getByLabelText('色彩數量')).toBeInTheDocument();
    // Compress button
    expect(screen.getByRole('button', { name: /壓縮/ })).toBeInTheDocument();
  });

  it('shows compress button after file upload', () => {
    renderPageWithFile();
    expect(screen.getByRole('button', { name: /壓縮/ })).toBeInTheDocument();
  });

  it('hides upload after file is selected', () => {
    renderPageWithFile();
    expect(screen.queryByText('上傳 GIF 以壓縮或優化檔案大小')).not.toBeInTheDocument();
  });

  it('shows original file size after upload', () => {
    renderPageWithFile();
    // File('gif-content') = 11 bytes => "11 B"
    expect(screen.getByText(/原始檔案大小/)).toBeInTheDocument();
  });

  it('shows color count slider after upload', () => {
    renderPageWithFile();
    const slider = screen.getByLabelText('色彩數量');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveAttribute('min', '2');
    expect(slider).toHaveAttribute('max', '256');
  });

  it('shows lossy level buttons', () => {
    renderPageWithFile();
    expect(screen.getByText('低')).toBeInTheDocument();
    expect(screen.getByText('中')).toBeInTheDocument();
    expect(screen.getByText('高')).toBeInTheDocument();
  });

  it('shows drop frames buttons', () => {
    renderPageWithFile();
    expect(screen.getByText('不移除')).toBeInTheDocument();
  });

  it('highlights selected lossy level', () => {
    renderPageWithFile();

    // Default is medium
    const mediumBtn = screen.getByText('中');
    expect(mediumBtn.className).toContain('bg-mint-600');

    // Click low
    const lowBtn = screen.getByText('低');
    fireEvent.click(lowBtn);
    expect(lowBtn.className).toContain('bg-mint-600');
    expect(mediumBtn.className).not.toContain('bg-mint-600');
  });

  it('shows resize width input after upload', () => {
    renderPageWithFile();
    expect(screen.getByLabelText('寬度 (px)')).toBeInTheDocument();
  });

  it('shows colors value text with default count', () => {
    renderPageWithFile();
    expect(screen.getByText('128 色')).toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GifSpeed } from '../gif/GifSpeed';

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
 * Helper to render GifSpeed inside a router context.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <GifSpeed />
    </MemoryRouter>
  );
}

describe('GifSpeed', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('GIF 速度調整')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows speed controls after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('1x')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
    expect(screen.getByText('0.25x')).toBeInTheDocument();
    expect(screen.getByText('0.5x')).toBeInTheDocument();
    expect(screen.getByText('1.5x')).toBeInTheDocument();
    expect(screen.getByText('3x')).toBeInTheDocument();
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

    expect(screen.queryByText('上傳 GIF 以調整動畫速度')).not.toBeInTheDocument();
  });

  it('shows custom delay input', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByLabelText('自訂延遲')).toBeInTheDocument();
  });

  it('shows speed heading after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('速度')).toBeInTheDocument();
  });

  it('highlights selected speed preset', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    // Default is 1x - should have active class
    const oneXButton = screen.getByText('1x');
    expect(oneXButton.className).toContain('bg-mint-600');

    // Click 2x
    const twoXButton = screen.getByText('2x');
    fireEvent.click(twoXButton);
    expect(twoXButton.className).toContain('bg-mint-600');
    expect(oneXButton.className).not.toContain('bg-mint-600');
  });
});

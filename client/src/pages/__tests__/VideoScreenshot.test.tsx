import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { VideoScreenshot } from '../video/VideoScreenshot';

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

/**
 * Renders the VideoScreenshot page inside a MemoryRouter for testing.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <VideoScreenshot />
    </MemoryRouter>
  );
}

describe('VideoScreenshot', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('影片截圖')).toBeInTheDocument();
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
    expect(screen.queryByText('上傳影片以擷取畫面')).not.toBeInTheDocument();
  });

  it('shows video element after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });
    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
  });

  it('shows format selector after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('輸出格式')).toBeInTheDocument();
    expect(screen.getByLabelText('PNG')).toBeChecked();
  });

  it('shows empty screenshots message initially', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('尚未擷取截圖')).toBeInTheDocument();
  });

  it('capture button calls canvas.toBlob', () => {
    const mockToBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob(['img'], { type: 'image/png' }));
    });
    const mockGetContext = vi.fn(() => ({
      drawImage: vi.fn(),
    }));

    // Mock createElement to intercept canvas creation
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'canvas') {
        Object.defineProperty(el, 'getContext', { value: mockGetContext });
        Object.defineProperty(el, 'toBlob', { value: mockToBlob });
      }
      return el;
    });

    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });

    // Set videoWidth/videoHeight on the video element so capture works
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 5.5, configurable: true });

    const captureBtn = screen.getByRole('button', { name: /擷取截圖/ });
    fireEvent.click(captureBtn);

    expect(mockGetContext).toHaveBeenCalledWith('2d');
    expect(mockToBlob).toHaveBeenCalled();

    // Restore
    vi.restoreAllMocks();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { GifTextOverlay } from '../gif/GifTextOverlay';

const mockExec = vi.fn().mockResolvedValue(0);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockDeleteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockRejectedValue(new Error('File not found'));
const mockOn = vi.fn();
const mockOff = vi.fn();

vi.mock('../../hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    ffmpeg: {
      writeFile: mockWriteFile,
      exec: mockExec,
      readFile: mockReadFile,
      deleteFile: mockDeleteFile,
      on: mockOn,
      off: mockOff,
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

beforeEach(() => {
  mockExec.mockClear();
  mockWriteFile.mockClear();
  mockDeleteFile.mockClear();
  mockReadFile.mockClear();
  mockOn.mockClear();
  mockOff.mockClear();
});

/** Render helper with router context */
function renderPage() {
  return render(
    <MemoryRouter>
      <GifTextOverlay />
    </MemoryRouter>,
  );
}

/** Helper to simulate file selection and image dimension loading */
function selectFileAndLoadImage() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
  fireEvent.change(input, { target: { files: [file] } });

  // Find the hidden image by its class (absolute h-px w-px)
  const hiddenImg = document.querySelector('img.absolute.opacity-0') as HTMLImageElement;
  if (hiddenImg) {
    Object.defineProperty(hiddenImg, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(hiddenImg, 'naturalHeight', { value: 150, configurable: true });
    fireEvent.load(hiddenImg);
  }
}

describe('GifTextOverlay', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('GIF 加文字')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('renders upload prompt text', () => {
    renderPage();
    expect(screen.getByText(/上傳 GIF/)).toBeInTheDocument();
  });

  it('hides upload after file is selected', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.queryByText(/上傳 GIF 以加入/)).not.toBeInTheDocument();
  });

  it('shows file info bar after file selection', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('test.gif')).toBeInTheDocument();
  });

  it('shows change file button after file selection', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('更換檔案')).toBeInTheDocument();
  });

  it('shows add text button after image loads', () => {
    renderPage();
    selectFileAndLoadImage();

    expect(screen.getByText(/新增文字/)).toBeInTheDocument();
  });

  it('shows settings panel header after image loads', () => {
    renderPage();
    selectFileAndLoadImage();

    expect(screen.getByText('文字設定')).toBeInTheDocument();
  });

  it('shows text box settings when text is added', () => {
    renderPage();
    selectFileAndLoadImage();

    fireEvent.click(screen.getByText(/新增文字/));

    expect(screen.getByText(/文字框 \d+/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('請輸入文字...')).toBeInTheDocument();
  });

  it('shows font selector when text is added', () => {
    renderPage();
    selectFileAndLoadImage();

    fireEvent.click(screen.getByText(/新增文字/));

    expect(screen.getByText('字型')).toBeInTheDocument();
    // Check that font options exist
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(8); // 8 fonts
  });

  it('shows position presets when text is added', () => {
    renderPage();
    selectFileAndLoadImage();

    fireEvent.click(screen.getByText(/新增文字/));

    expect(screen.getByText('預設位置')).toBeInTheDocument();
    expect(screen.getByText('左上')).toBeInTheDocument();
    expect(screen.getByText('正中')).toBeInTheDocument();
    expect(screen.getByText('右下')).toBeInTheDocument();
  });

  it('shows frame range controls when text is added', () => {
    renderPage();
    selectFileAndLoadImage();

    fireEvent.click(screen.getByText(/新增文字/));

    expect(screen.getByText('全部幀')).toBeInTheDocument();
    expect(screen.getByText('自訂範圍')).toBeInTheDocument();
  });

  it('shows apply button', () => {
    renderPage();
    selectFileAndLoadImage();

    expect(screen.getByRole('button', { name: /套用/ })).toBeInTheDocument();
  });

  it('shows bold, italic, and shadow checkboxes', () => {
    renderPage();
    selectFileAndLoadImage();

    fireEvent.click(screen.getByText(/新增文字/));

    expect(screen.getByText('粗體')).toBeInTheDocument();
    expect(screen.getByText('斜體')).toBeInTheDocument();
    expect(screen.getByText('陰影')).toBeInTheDocument();
  });

  it('shows remove text button', () => {
    renderPage();
    selectFileAndLoadImage();

    fireEvent.click(screen.getByText(/新增文字/));

    expect(screen.getByText('移除此文字')).toBeInTheDocument();
  });

  it('removes text box when remove is clicked', () => {
    renderPage();
    selectFileAndLoadImage();

    fireEvent.click(screen.getByText(/新增文字/));
    expect(screen.getByText(/文字框 \d+/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('移除此文字'));
    expect(screen.queryByText(/文字框 \d+/)).not.toBeInTheDocument();
  });

  it('shows image size info after image loads', () => {
    renderPage();
    selectFileAndLoadImage();

    expect(screen.getByText(/200 × 150/)).toBeInTheDocument();
  });
});

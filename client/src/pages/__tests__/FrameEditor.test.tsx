import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { FrameEditor } from '../gif/FrameEditor';

const mockExec = vi.fn().mockResolvedValue(0);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockDeleteFile = vi.fn().mockResolvedValue(undefined);

let readFileCallCount = 0;

/** Mock readFile to return data for first N calls then throw (simulate N frames) */
const mockReadFile = vi.fn().mockImplementation(() => {
  readFileCallCount++;
  if (readFileCallCount <= 3) {
    return Promise.resolve(new Uint8Array([137, 80, 78, 71])); // PNG magic bytes
  }
  return Promise.reject(new Error('File not found'));
});

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
  if (!globalThis.createImageBitmap) {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 100,
      height: 100,
      close: vi.fn(),
    });
  }
});

beforeEach(() => {
  readFileCallCount = 0;
  mockExec.mockClear();
  mockWriteFile.mockClear();
  mockDeleteFile.mockClear();
  mockReadFile.mockClear();
  mockOn.mockClear();
  mockOff.mockClear();
  // Reset readFile to return 3 frames then fail
  mockReadFile.mockImplementation(() => {
    readFileCallCount++;
    if (readFileCallCount <= 3) {
      return Promise.resolve(new Uint8Array([137, 80, 78, 71]));
    }
    return Promise.reject(new Error('File not found'));
  });
});

/** Render helper with router context */
function renderPage() {
  return render(
    <MemoryRouter>
      <FrameEditor />
    </MemoryRouter>,
  );
}

describe('FrameEditor', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('動圖幀編輯器')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('renders upload prompt text', () => {
    renderPage();
    expect(screen.getByText(/上傳 GIF/)).toBeInTheDocument();
  });

  it('hides upload after file is selected', async () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.queryByText(/上傳 GIF/)).not.toBeInTheDocument();
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

  it('shows extracting progress when frames are being extracted', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    // Extraction starts immediately
    expect(screen.getByText(/解析中/)).toBeInTheDocument();
  });

  it('shows frame editor controls after extraction completes', async () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('全選')).toBeInTheDocument();
    });
    expect(screen.getByText('取消全選')).toBeInTheDocument();
    expect(screen.getByText('刪除選取')).toBeInTheDocument();
    expect(screen.getByText('複製選取')).toBeInTheDocument();
    expect(screen.getByText('反轉順序')).toBeInTheDocument();
  });

  it('shows settings panel after extraction', async () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('設定')).toBeInTheDocument();
      expect(screen.getByLabelText('全域延遲（ms）')).toBeInTheDocument();
      expect(screen.getByText('速度預設')).toBeInTheDocument();
    });
  });

  it('shows generate button after extraction', async () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /生成/ })).toBeInTheDocument();
    });
  });

  it('shows output format selector', async () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByLabelText('輸出格式')).toBeInTheDocument();
    });
  });

  it('shows loop count controls', async () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('無限循環')).toBeInTheDocument();
      expect(screen.getByText('自訂次數')).toBeInTheDocument();
    });
  });

  it('shows stats after extraction', async () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['gif-content'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/總幀數/)).toBeInTheDocument();
      expect(screen.getByText(/預估大小/)).toBeInTheDocument();
    });
  });
});

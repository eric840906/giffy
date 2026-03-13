import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AnimatedImageConvert } from '../image/AnimatedImageConvert';

vi.mock('../../hooks/useFFmpeg', () => ({
  useFFmpeg: () => ({
    ffmpeg: {
      writeFile: vi.fn(),
      exec: vi.fn().mockResolvedValue(0),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([0])),
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

vi.mock('jszip', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      file: vi.fn(),
      generateAsync: vi.fn().mockResolvedValue(new Blob(['zip'])),
    })),
  };
});

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
      <AnimatedImageConvert />
    </MemoryRouter>
  );
}

describe('AnimatedImageConvert', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('動圖格式轉換')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows upload prompt text initially', () => {
    renderPage();
    expect(
      screen.getByText('上傳動圖以轉換格式（GIF、APNG、WebP）'),
    ).toBeInTheDocument();
  });

  it('shows format selector and convert button after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('全部轉換')).toBeInTheDocument();
  });

  it('hides upload prompt after files are selected', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      screen.queryByText('上傳動圖以轉換格式（GIF、APNG、WebP）'),
    ).not.toBeInTheDocument();
  });

  it('shows image count after selecting files', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['img1'], 'cat.gif', { type: 'image/gif' }),
      new File(['img2'], 'dog.gif', { type: 'image/gif' }),
    ];
    fireEvent.change(input, { target: { files } });

    expect(screen.getByText('2 張動圖')).toBeInTheDocument();
  });

  it('shows add more button after selecting files', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('新增更多動圖')).toBeInTheDocument();
  });

  it('shows remove button on thumbnails', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    const removeButtons = screen.getAllByLabelText('移除動圖');
    expect(removeButtons.length).toBe(1);
  });

  it('removes an image when remove button is clicked', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['img1'], 'cat.gif', { type: 'image/gif' }),
      new File(['img2'], 'dog.gif', { type: 'image/gif' }),
    ];
    fireEvent.change(input, { target: { files } });

    expect(screen.getByText('2 張動圖')).toBeInTheDocument();

    const removeButtons = screen.getAllByLabelText('移除動圖');
    fireEvent.click(removeButtons[0]);

    expect(screen.getByText('1 張動圖')).toBeInTheDocument();
  });

  it('allows changing target format', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'apng' } });

    expect(select.value).toBe('apng');
  });

  it('returns to upload view when all images are removed', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['img'], 'test.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [file] } });

    const removeBtn = screen.getByLabelText('移除動圖');
    fireEvent.click(removeBtn);

    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });
});

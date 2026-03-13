import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ImagesToGif } from '../gif/ImagesToGif';

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
    progress: 100,
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

function renderPage() {
  return render(
    <MemoryRouter>
      <ImagesToGif />
    </MemoryRouter>
  );
}

describe('ImagesToGif', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('圖片合成 GIF')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows settings panel after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['img1'], 'cat.png', { type: 'image/png' }),
      new File(['img2'], 'dog.png', { type: 'image/png' }),
    ];
    fireEvent.change(input, { target: { files } });

    expect(screen.getByText('輸出設定')).toBeInTheDocument();
  });

  it('shows generate and preview buttons after file upload', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['img1'], 'cat.png', { type: 'image/png' }),
    ];
    fireEvent.change(input, { target: { files } });

    expect(screen.getByRole('button', { name: /預覽動畫/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /生成 GIF/ })).toBeInTheDocument();
  });

  it('hides upload prompt after files are selected', () => {
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['img1'], 'cat.png', { type: 'image/png' }),
    ];
    fireEvent.change(input, { target: { files } });

    expect(screen.queryByText('上傳多張圖片來合成 GIF 動畫')).not.toBeInTheDocument();
  });
});

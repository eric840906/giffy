import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ImageCompress } from '../image/ImageCompress';

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

/**
 * Helper to render ImageCompress inside a router context.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <ImageCompress />
    </MemoryRouter>
  );
}

/**
 * Helper to upload mock image files.
 */
function uploadFiles(files?: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const defaultFiles = files || [
    new File(['img1'], 'photo.jpg', { type: 'image/jpeg' }),
  ];
  fireEvent.change(input, { target: { files: defaultFiles } });
  return input;
}

describe('ImageCompress', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('圖片壓縮')).toBeInTheDocument();
  });

  it('renders upload component initially', () => {
    renderPage();
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('shows upload prompt text', () => {
    renderPage();
    expect(screen.getByText('上傳圖片以壓縮檔案大小（PNG、JPG、WebP）')).toBeInTheDocument();
  });

  it('hides upload after files selected', () => {
    renderPage();
    uploadFiles();

    expect(screen.queryByText('上傳圖片以壓縮檔案大小（PNG、JPG、WebP）')).not.toBeInTheDocument();
  });

  it('shows image count after selecting files', () => {
    renderPage();
    uploadFiles([
      new File(['img1'], 'cat.jpg', { type: 'image/jpeg' }),
      new File(['img2'], 'dog.png', { type: 'image/png' }),
    ]);

    expect(screen.getByText('2 張圖片')).toBeInTheDocument();
  });

  it('shows add more button after selecting files', () => {
    renderPage();
    uploadFiles();

    expect(screen.getByText('新增更多圖片')).toBeInTheDocument();
  });

  it('shows remove button on thumbnails', () => {
    renderPage();
    uploadFiles();

    const removeButtons = screen.getAllByLabelText('移除圖片');
    expect(removeButtons.length).toBe(1);
  });

  it('removes an image when remove button is clicked', () => {
    renderPage();
    uploadFiles([
      new File(['img1'], 'cat.jpg', { type: 'image/jpeg' }),
      new File(['img2'], 'dog.png', { type: 'image/png' }),
    ]);

    expect(screen.getByText('2 張圖片')).toBeInTheDocument();

    const removeButtons = screen.getAllByLabelText('移除圖片');
    fireEvent.click(removeButtons[0]);

    expect(screen.getByText('1 張圖片')).toBeInTheDocument();
  });

  it('shows quality slider', () => {
    renderPage();
    uploadFiles();

    expect(screen.getByLabelText(/品質/)).toBeInTheDocument();
  });

  it('shows max dimension input', () => {
    renderPage();
    uploadFiles();

    expect(screen.getByLabelText(/最大寬/)).toBeInTheDocument();
  });

  it('shows output format selector', () => {
    renderPage();
    uploadFiles();

    expect(screen.getByLabelText(/輸出格式/)).toBeInTheDocument();
  });

  it('shows compress button', () => {
    renderPage();
    uploadFiles();

    expect(screen.getByRole('button', { name: /壓縮/ })).toBeInTheDocument();
  });

  it('returns to upload view when all images are removed', () => {
    renderPage();
    uploadFiles();

    const removeBtn = screen.getByLabelText('移除圖片');
    fireEvent.click(removeBtn);

    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
  });

  it('allows changing output format', () => {
    renderPage();
    uploadFiles();

    const select = screen.getByLabelText(/輸出格式/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'webp' } });

    expect(select.value).toBe('webp');
  });
});

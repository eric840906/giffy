import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Preview } from '../Preview/Preview';

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

describe('Preview', () => {
  it('renders image preview for image files', () => {
    const file = new File(['img'], 'test.png', { type: 'image/png' });
    render(<Preview file={file} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders video preview for video files', () => {
    const file = new File(['vid'], 'test.mp4', { type: 'video/mp4' });
    const { container } = render(<Preview file={file} />);
    expect(container.querySelector('video')).toBeInTheDocument();
  });

  it('renders image preview for gif files', () => {
    const file = new File(['gif'], 'test.gif', { type: 'image/gif' });
    render(<Preview file={file} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders preview title from i18n', () => {
    const file = new File(['img'], 'test.png', { type: 'image/png' });
    render(<Preview file={file} />);
    expect(screen.getByText('預覽')).toBeInTheDocument();
  });
});

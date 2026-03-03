import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ImageSequence } from '../ImageSequence/ImageSequence';

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

function createImageFiles(count: number): File[] {
  return Array.from({ length: count }, (_, i) =>
    new File(['img'], `image-${i + 1}.png`, { type: 'image/png' }),
  );
}

describe('ImageSequence', () => {
  it('renders image thumbnails for each file', () => {
    const files = createImageFiles(3);
    render(
      <ImageSequence images={files} onReorder={vi.fn()} onRemove={vi.fn()} />,
    );

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveAttribute('alt', 'image-1.png');
    expect(images[1]).toHaveAttribute('alt', 'image-2.png');
    expect(images[2]).toHaveAttribute('alt', 'image-3.png');
  });

  it('displays image count text', () => {
    const files = createImageFiles(3);
    render(
      <ImageSequence images={files} onReorder={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText('3 張圖片')).toBeInTheDocument();
  });

  it('calls onRemove with correct index when remove button clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const files = createImageFiles(3);
    render(
      <ImageSequence images={files} onReorder={vi.fn()} onRemove={onRemove} />,
    );

    const removeButtons = screen.getAllByRole('button');
    await user.click(removeButtons[1]);

    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('shows drag-to-reorder hint text', () => {
    const files = createImageFiles(2);
    render(
      <ImageSequence images={files} onReorder={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText('拖拉排序')).toBeInTheDocument();
  });
});

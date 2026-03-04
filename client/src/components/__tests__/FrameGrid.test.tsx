import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { FrameGrid, type FrameData } from '../FrameGrid/FrameGrid';

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

/** Create mock frames for testing */
function createMockFrames(count: number): FrameData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `frame-${i}`,
    blob: new Blob(['png-data'], { type: 'image/png' }),
    delay: 100,
    originalIndex: i + 1,
  }));
}

/** Render helper with router context */
function renderGrid(props: Partial<React.ComponentProps<typeof FrameGrid>> = {}) {
  const defaultProps = {
    frames: createMockFrames(6),
    selectedIds: new Set<string>(),
    onSelectionChange: vi.fn(),
    onReorder: vi.fn(),
  };
  return render(
    <MemoryRouter>
      <FrameGrid {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe('FrameGrid', () => {
  it('renders frame count', () => {
    renderGrid();
    expect(screen.getByText('6 幀')).toBeInTheDocument();
  });

  it('renders all frame thumbnails', () => {
    renderGrid();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(6);
  });

  it('renders frame number badges', () => {
    renderGrid();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders delay labels', () => {
    renderGrid();
    const delayLabels = screen.getAllByText('100 ms');
    expect(delayLabels).toHaveLength(6);
  });

  it('highlights selected frames', () => {
    renderGrid({ selectedIds: new Set(['frame-0', 'frame-2']) });
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
    expect(options[2].getAttribute('aria-selected')).toBe('true');
  });

  it('calls onSelectionChange on click', () => {
    const onSelectionChange = vi.fn();
    renderGrid({ onSelectionChange });
    const options = screen.getAllByRole('option');
    fireEvent.click(options[1]);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['frame-1']));
  });

  it('supports Ctrl+click for toggle select', () => {
    const onSelectionChange = vi.fn();
    renderGrid({ onSelectionChange, selectedIds: new Set(['frame-0']) });
    const options = screen.getAllByRole('option');
    fireEvent.click(options[2], { ctrlKey: true });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['frame-0', 'frame-2']));
  });

  it('disables interactions when disabled', () => {
    const onSelectionChange = vi.fn();
    renderGrid({ onSelectionChange, disabled: true });
    const options = screen.getAllByRole('option');
    fireEvent.click(options[0]);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});

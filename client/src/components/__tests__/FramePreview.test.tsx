import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { FramePreview } from '../FramePreview/FramePreview';
import type { FrameData } from '../FrameGrid/FrameGrid';

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
  // Mock createImageBitmap
  if (!globalThis.createImageBitmap) {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: 100,
      height: 100,
      close: vi.fn(),
    });
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
function renderPreview(props: Partial<React.ComponentProps<typeof FramePreview>> = {}) {
  const defaultProps = {
    frames: createMockFrames(5),
    loopCount: 0,
  };
  return render(
    <MemoryRouter>
      <FramePreview {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe('FramePreview', () => {
  it('renders preview heading', () => {
    renderPreview();
    expect(screen.getByText('預覽')).toBeInTheDocument();
  });

  it('renders play button', () => {
    renderPreview();
    expect(screen.getByRole('button', { name: /播放/ })).toBeInTheDocument();
  });

  it('renders step buttons', () => {
    renderPreview();
    expect(screen.getByRole('button', { name: /上一幀/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下一幀/ })).toBeInTheDocument();
  });

  it('renders frame indicator', () => {
    renderPreview();
    expect(screen.getByText('第 1/5 幀')).toBeInTheDocument();
  });

  it('renders canvas element', () => {
    renderPreview();
    expect(screen.getByRole('img', { name: /預覽/ })).toBeInTheDocument();
  });
});

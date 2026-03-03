import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CropOverlay } from '../CropOverlay/CropOverlay';

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

const defaultProps = {
  src: 'https://example.com/test.png',
  imageWidth: 800,
  imageHeight: 600,
  crop: { x: 100, y: 50, width: 400, height: 300 },
  onChange: vi.fn(),
};

describe('CropOverlay', () => {
  it('renders the image with correct src', () => {
    const { container } = render(<CropOverlay {...defaultProps} />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', defaultProps.src);
  });

  it('renders crop overlay container with data-testid', () => {
    render(<CropOverlay {...defaultProps} />);
    const container = screen.getByTestId('crop-overlay');
    expect(container).toBeInTheDocument();
  });

  it('renders crop rectangle with correct percentage dimensions', () => {
    render(<CropOverlay {...defaultProps} />);
    const cropRect = screen.getByTestId('crop-rect');
    expect(cropRect).toBeInTheDocument();

    // crop.x=100 / imageWidth=800 * 100 = 12.5%
    expect(cropRect.style.left).toBe('12.5%');
    // crop.y=50 / imageHeight=600 * 100 = 8.333...%
    expect(parseFloat(cropRect.style.top)).toBeCloseTo(8.333, 2);
    // crop.width=400 / imageWidth=800 * 100 = 50%
    expect(cropRect.style.width).toBe('50%');
    // crop.height=300 / imageHeight=600 * 100 = 50%
    expect(cropRect.style.height).toBe('50%');
  });

  it('shows 8 resize handles (4 corners + 4 edges)', () => {
    render(<CropOverlay {...defaultProps} />);
    const handles = screen.getAllByTestId('crop-handle');
    expect(handles).toHaveLength(8);
  });

  it('renders dark overlay areas around the crop', () => {
    render(<CropOverlay {...defaultProps} />);
    expect(screen.getByTestId('crop-overlay-top')).toBeInTheDocument();
    expect(screen.getByTestId('crop-overlay-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('crop-overlay-left')).toBeInTheDocument();
    expect(screen.getByTestId('crop-overlay-right')).toBeInTheDocument();
  });

  it('renders overlay regions with correct percentage sizes', () => {
    render(<CropOverlay {...defaultProps} />);

    // Top overlay height should match crop top offset: 50/600*100 = 8.333%
    const topOverlay = screen.getByTestId('crop-overlay-top');
    expect(parseFloat(topOverlay.style.height)).toBeCloseTo(8.333, 2);

    // Left overlay width should match crop left offset: 100/800*100 = 12.5%
    const leftOverlay = screen.getByTestId('crop-overlay-left');
    expect(leftOverlay.style.width).toBe('12.5%');
  });

  it('image has draggable=false to prevent browser drag', () => {
    const { container } = render(<CropOverlay {...defaultProps} />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('draggable', 'false');
  });

  it('container has application role with accessible label', () => {
    render(<CropOverlay {...defaultProps} />);
    const container = screen.getByTestId('crop-overlay');
    expect(container).toHaveAttribute('role', 'application');
    // The aria-label comes from i18n key: gifCropResize.cropHint
    expect(container).toHaveAttribute('aria-label');
  });
});

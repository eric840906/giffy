import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { VideoControls } from '../VideoControls/VideoControls';

describe('VideoControls', () => {
  it('renders play button and time display', () => {
    const videoRef = createRef<HTMLVideoElement>();
    render(<VideoControls videoRef={videoRef} onTimeChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /播放/ })).toBeInTheDocument();
    expect(screen.getByText('0:00 / 0:00')).toBeInTheDocument();
  });

  it('renders seek slider', () => {
    const videoRef = createRef<HTMLVideoElement>();
    render(<VideoControls videoRef={videoRef} onTimeChange={vi.fn()} />);

    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
  });

  it('renders test id', () => {
    const videoRef = createRef<HTMLVideoElement>();
    render(<VideoControls videoRef={videoRef} onTimeChange={vi.fn()} />);

    expect(screen.getByTestId('video-controls')).toBeInTheDocument();
  });
});

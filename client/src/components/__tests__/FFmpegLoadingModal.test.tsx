import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FFmpegLoadingModal } from '../FFmpegLoadingModal/FFmpegLoadingModal';

describe('FFmpegLoadingModal', () => {
  it('renders nothing when loaded', () => {
    const { container } = render(
      <FFmpegLoadingModal loading={false} loaded={true} progress={100} error={null} onRetry={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when not loading and no error', () => {
    const { container } = render(
      <FFmpegLoadingModal loading={false} loaded={false} progress={0} error={null} onRetry={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders loading state with progress', () => {
    render(
      <FFmpegLoadingModal loading={true} loaded={false} progress={42} error={null} onRetry={vi.fn()} />,
    );
    expect(screen.getByText('正在準備編輯工具')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('renders error state with retry button', async () => {
    const onRetry = vi.fn();
    render(
      <FFmpegLoadingModal loading={false} loaded={false} progress={0} error="Network error" onRetry={onRetry} />,
    );
    expect(screen.getByText('載入失敗')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('has modal dialog role', () => {
    render(
      <FFmpegLoadingModal loading={true} loaded={false} progress={0} error={null} onRetry={vi.fn()} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

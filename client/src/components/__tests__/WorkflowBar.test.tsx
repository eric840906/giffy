import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { WorkflowBar } from '../WorkflowBar/WorkflowBar';

beforeAll(() => {
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
});

function renderBar(currentTool = 'videoToGif', onContinueEdit?: () => void) {
  const file = new Blob(['test'], { type: 'image/gif' });
  return render(
    <MemoryRouter>
      <WorkflowBar file={file} fileName="output.gif" currentTool={currentTool} onContinueEdit={onContinueEdit} />
    </MemoryRouter>
  );
}

describe('WorkflowBar', () => {
  it('renders download button', () => {
    renderBar();
    expect(screen.getByRole('button', { name: '下載' })).toBeInTheDocument();
  });

  it('renders send-to-tool button', () => {
    renderBar();
    expect(screen.getByRole('button', { name: '傳到其他工具' })).toBeInTheDocument();
  });

  it('shows tool list when send-to-tool is clicked', async () => {
    renderBar();
    const btn = screen.getByRole('button', { name: '傳到其他工具' });
    await userEvent.click(btn);
    expect(screen.getByText('GIF 編輯器')).toBeInTheDocument();
  });

  it('excludes current tool from send-to list', async () => {
    renderBar('videoToGif');
    const btn = screen.getByRole('button', { name: '傳到其他工具' });
    await userEvent.click(btn);
    const links = screen.getAllByRole('link');
    const selfLink = links.find((l) => l.getAttribute('href') === '/gif/video-to-gif');
    expect(selfLink).toBeUndefined();
  });

  it('does not render continue edit button when callback is not provided', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: '繼續編輯' })).not.toBeInTheDocument();
  });

  it('renders continue edit button when callback is provided', () => {
    const onContinueEdit = vi.fn();
    renderBar('videoToGif', onContinueEdit);
    expect(screen.getByRole('button', { name: '繼續編輯' })).toBeInTheDocument();
  });

  it('calls onContinueEdit when continue edit button is clicked', async () => {
    const onContinueEdit = vi.fn();
    renderBar('videoToGif', onContinueEdit);
    const btn = screen.getByRole('button', { name: '繼續編輯' });
    await userEvent.click(btn);
    expect(onContinueEdit).toHaveBeenCalledOnce();
  });

  it('closes dropdown when Escape key is pressed', async () => {
    renderBar();
    const btn = screen.getByRole('button', { name: '傳到其他工具' });
    await userEvent.click(btn);
    expect(screen.getByText('GIF 編輯器')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('GIF 編輯器')).not.toBeInTheDocument();
  });
});

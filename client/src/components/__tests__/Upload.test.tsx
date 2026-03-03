import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Upload } from '../Upload/Upload';

describe('Upload', () => {
  it('renders drop zone with instructions', () => {
    render(<Upload onFileSelect={vi.fn()} />);
    expect(screen.getByText('拖放檔案到這裡')).toBeInTheDocument();
    expect(screen.getByText('選擇檔案')).toBeInTheDocument();
  });

  it('calls onFileSelect when file is selected', () => {
    const onFileSelect = vi.fn();
    render(<Upload onFileSelect={onFileSelect} accept="video/*" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileSelect).toHaveBeenCalledWith([file]);
  });

  it('rejects files over maxSize', () => {
    const onFileSelect = vi.fn();
    render(<Upload onFileSelect={onFileSelect} maxSize={1024} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const largeFile = new File(['x'.repeat(2048)], 'big.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [largeFile] } });

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays selected file info', () => {
    const onFileSelect = vi.fn();
    render(<Upload onFileSelect={onFileSelect} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'test.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('test.mp4')).toBeInTheDocument();
  });
});

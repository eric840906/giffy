import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimeRangeSlider } from '../TimeRangeSlider/TimeRangeSlider';

describe('TimeRangeSlider', () => {
  const defaultProps = {
    duration: 60,
    start: 0,
    end: 60,
    onChange: vi.fn(),
  };

  it('renders start and end time labels', () => {
    render(<TimeRangeSlider {...defaultProps} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
    // 1:00 appears in both the duration display and end time label
    const matches = screen.getAllByText('1:00');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders two range inputs', () => {
    const { container } = render(<TimeRangeSlider {...defaultProps} />);
    const inputs = container.querySelectorAll('input[type="range"]');
    expect(inputs.length).toBe(2);
  });

  it('calls onChange when start slider changes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeRangeSlider {...defaultProps} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input[type="range"]');
    fireEvent.change(inputs[0], { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith(10, 60);
  });

  it('calls onChange when end slider changes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeRangeSlider {...defaultProps} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input[type="range"]');
    fireEvent.change(inputs[1], { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith(0, 45);
  });

  it('prevents start from exceeding end', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeRangeSlider {...defaultProps} start={0} end={30} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input[type="range"]');
    fireEvent.change(inputs[0], { target: { value: '35' } });
    expect(onChange).toHaveBeenCalledWith(29.9, 30);
  });

  it('prevents end from going below start', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeRangeSlider {...defaultProps} start={20} end={60} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input[type="range"]');
    fireEvent.change(inputs[1], { target: { value: '15' } });
    expect(onChange).toHaveBeenCalledWith(20, 20.1);
  });

  it('displays formatted duration', () => {
    render(<TimeRangeSlider {...defaultProps} start={10} end={40} />);
    // Duration should be 30 seconds = 0:30
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { Header } from '../Layout/Header';

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders logo text', () => {
    renderHeader();
    expect(screen.getByText('Giffy')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    renderHeader();
    // Default language is zh-TW
    expect(screen.getByText('GIF 工具')).toBeInTheDocument();
    expect(screen.getByText('影片工具')).toBeInTheDocument();
    expect(screen.getByText('圖片工具')).toBeInTheDocument();
  });

  it('toggles theme on button click', async () => {
    renderHeader();
    const themeBtn = screen.getByRole('button', { name: /深色模式/ });
    await userEvent.click(themeBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles language on button click', async () => {
    renderHeader();
    const langBtn = screen.getByRole('button', { name: 'EN' });
    await userEvent.click(langBtn);
    expect(screen.getByRole('button', { name: '中文' })).toBeInTheDocument();
  });
});

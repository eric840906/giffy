import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Home } from '../Home/Home';

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe('Home', () => {
  it('renders page title', () => {
    renderHome();
    expect(screen.getByText('選擇工具開始編輯')).toBeInTheDocument();
  });

  it('renders all 6 tool cards', () => {
    renderHome();
    const cards = screen.getAllByRole('link');
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });

  it('renders tool names from i18n', () => {
    renderHome();
    expect(screen.getByText('影片轉 GIF')).toBeInTheDocument();
    expect(screen.getByText('圖片合成 GIF')).toBeInTheDocument();
    expect(screen.getByText('GIF 裁切/縮放')).toBeInTheDocument();
    expect(screen.getByText('影片裁切（時間）')).toBeInTheDocument();
    expect(screen.getByText('影片裁切（畫面）')).toBeInTheDocument();
    expect(screen.getByText('圖片格式轉換')).toBeInTheDocument();
  });
});

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Translate } from '@phosphor-icons/react';
import { useTheme } from '../../hooks/useTheme';

/**
 * Application header with logo, navigation, theme toggle, and language toggle.
 */
export function Header() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  /** Toggle between zh-TW and en, persisting to localStorage */
  const toggleLanguage = () => {
    const next = i18n.language === 'zh-TW' ? 'en' : 'zh-TW';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-700 dark:bg-gray-900/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-2xl font-bold text-purple-600 dark:text-purple-400">
          {t('app.title')}
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="main navigation">
          <Link to="/" className="text-sm font-medium text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-300 dark:hover:text-purple-400">
            {t('nav.home')}
          </Link>
          <Link to="/gif/video-to-gif" className="text-sm font-medium text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-300 dark:hover:text-purple-400">
            {t('nav.gifTools')}
          </Link>
          <Link to="/video/trim" className="text-sm font-medium text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-300 dark:hover:text-purple-400">
            {t('nav.videoTools')}
          </Link>
          <Link to="/image/convert" className="text-sm font-medium text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-300 dark:hover:text-purple-400">
            {t('nav.imageTools')}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label={theme === 'light' ? t('theme.dark') : t('theme.light')}
          >
            {theme === 'light' ? <Moon size={24} weight="duotone" /> : <Sun size={24} weight="duotone" />}
          </button>
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label={i18n.language === 'zh-TW' ? 'EN' : '\u4E2D\u6587'}
          >
            <Translate size={20} weight="duotone" />
            <span>{i18n.language === 'zh-TW' ? 'EN' : '\u4E2D\u6587'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

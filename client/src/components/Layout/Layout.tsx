import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { useFFmpeg } from '../../hooks/useFFmpeg';
import { FFmpegLoadingModal } from '../FFmpegLoadingModal/FFmpegLoadingModal';

/**
 * Root layout component with Header and content area.
 * Renders the global FFmpegLoadingModal so it only appears once across all pages.
 */
export function Layout() {
  const { loading, loaded, progress, error, load } = useFFmpeg();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 transition-colors dark:bg-gray-950 dark:text-gray-100">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <FFmpegLoadingModal loading={loading} loaded={loaded} progress={progress} error={error} onRetry={load} />
    </div>
  );
}

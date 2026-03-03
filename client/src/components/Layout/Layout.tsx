import { Outlet } from 'react-router-dom';
import { Header } from './Header';

/**
 * Root layout component with Header and content area.
 */
export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 transition-colors dark:bg-gray-950 dark:text-gray-100">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

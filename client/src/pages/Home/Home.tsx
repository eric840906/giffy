import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TOOLS } from '../../utils/constants';

/**
 * Home page displaying tool selection cards.
 */
export function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
          {t('home.title')}
        </h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          {t('app.subtitle')}
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.id}
            to={tool.path}
            className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-3 text-4xl">{tool.icon}</div>
            <h2 className="text-lg font-semibold text-gray-800 group-hover:text-purple-600 dark:text-gray-100 dark:group-hover:text-purple-400">
              {t(`home.tools.${tool.id}.name`)}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t(`home.tools.${tool.id}.description`)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

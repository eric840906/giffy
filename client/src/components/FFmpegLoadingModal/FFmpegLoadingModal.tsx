import { useTranslation } from 'react-i18next';
import { Spinner } from '@phosphor-icons/react';

interface FFmpegLoadingModalProps {
  loading: boolean;
  loaded: boolean;
  progress: number;
  error: string | null;
  onRetry: () => void;
}

/**
 * Full-screen modal overlay shown while ffmpeg.wasm downloads.
 * Blocks all interaction until ffmpeg is ready.
 * Shows real download progress for the .wasm file (~32MB).
 */
export function FFmpegLoadingModal({ loading, loaded, progress, error, onRetry }: FFmpegLoadingModalProps) {
  const { t } = useTranslation();

  if (loaded || (!loading && !error)) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('ffmpeg.loadingTitle')}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
        {error ? (
          <>
            <p className="mb-2 text-center text-lg font-semibold text-red-600 dark:text-red-400">
              {t('ffmpeg.error')}
            </p>
            <p className="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {error}
            </p>
            <button
              onClick={onRetry}
              className="w-full rounded-xl bg-mint-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700"
            >
              {t('ffmpeg.retry')}
            </button>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-center">
              <Spinner size={28} weight="bold" className="animate-spin text-mint-600" />
            </div>
            <p className="mb-1 text-center text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t('ffmpeg.loadingTitle')}
            </p>
            <p className="mb-4 text-center text-xs text-gray-500 dark:text-gray-400">
              {t('ffmpeg.loadingMessage')}
            </p>
            <div className="mb-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-2 rounded-full bg-mint-600 transition-all"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <p className="text-center text-sm font-medium text-mint-600 dark:text-mint-400">
              {t('ffmpeg.progress', { percent: progress })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

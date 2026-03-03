import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PreviewProps {
  /** File or Blob to preview */
  file: File | Blob;
  /** Override MIME type detection */
  type?: string;
}

/**
 * Preview component that renders image, GIF, or video based on file type.
 * Creates a temporary object URL for the file and revokes it on cleanup
 * or when the file changes to prevent memory leaks.
 *
 * @example
 * ```tsx
 * <Preview file={selectedFile} />
 * <Preview file={blob} type="image/png" />
 * ```
 */
export function Preview({ file, type }: PreviewProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const mimeType = type || (file instanceof File ? file.type : '');
  const isVideo = mimeType.startsWith('video/');

  if (!url) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {t('preview.title')}
      </h3>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
        {isVideo ? (
          <video src={url} controls className="max-h-96 max-w-full" />
        ) : (
          <img
            src={url}
            alt="preview"
            className="max-h-96 max-w-full object-contain"
          />
        )}
      </div>
    </div>
  );
}

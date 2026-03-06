import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudArrowUp } from '@phosphor-icons/react';
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from '../../utils/constants';
import { formatSize } from '../../utils/formatSize';

interface UploadProps {
  /** MIME types to accept, e.g. "video/*", "image/*" */
  accept?: string;
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Callback when valid file(s) are selected */
  onFileSelect: (files: File[]) => void;
}

/**
 * File upload component with drag-and-drop and click-to-select support.
 * Validates file size and displays friendly error messages.
 */
export function Upload({
  accept,
  multiple = false,
  maxSize = MAX_FILE_SIZE,
  onFileSelect,
}: UploadProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const maxSizeMB = maxSize / (1024 * 1024);

  /**
   * Check whether a file's MIME type matches the accept string.
   * Supports wildcards like "video/*" and comma-separated lists.
   */
  const matchesAccept = useCallback(
    (file: File): boolean => {
      if (!accept) return true;
      const patterns = accept.split(',').map((s) => s.trim());
      return patterns.some((pattern) => {
        if (pattern.endsWith('/*')) {
          return file.type.startsWith(pattern.replace('/*', '/'));
        }
        return file.type === pattern;
      });
    },
    [accept],
  );

  /**
   * Validates file types and sizes, then triggers the onFileSelect callback
   * if all files pass validation.
   */
  const validateAndSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      const fileArray = Array.from(files);

      const invalid = fileArray.find((f) => !matchesAccept(f));
      if (invalid) {
        setError(t('upload.errorFormat'));
        return;
      }

      const oversized = fileArray.find((f) => f.size > maxSize);
      if (oversized) {
        setError(t('upload.errorTooLarge', { size: MAX_FILE_SIZE_MB }));
        return;
      }

      setSelectedFiles(fileArray);
      onFileSelect(fileArray);
    },
    [maxSize, matchesAccept, onFileSelect, t],
  );

  /** Handles dragOver to show visual feedback */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  /** Handles dragLeave to reset visual feedback */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  /** Handles file drop */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      validateAndSelect(e.dataTransfer.files);
    },
    [validateAndSelect],
  );

  /** Handles file input change */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      validateAndSelect(e.target.files);
    },
    [validateAndSelect],
  );

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${
          isDragging
            ? 'border-mint-500 bg-mint-50 dark:bg-mint-950/20'
            : 'border-gray-300 bg-gray-50 hover:border-mint-400 hover:bg-mint-50/50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-mint-500 dark:hover:bg-mint-950/10'
        }`}
        role="button"
        tabIndex={0}
        aria-label={t('upload.browse')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <div className="mb-3">
          <CloudArrowUp size={48} weight="duotone" className="text-mint-500 dark:text-mint-400" />
        </div>
        <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
          {t('upload.dragDrop')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('upload.or')}
        </p>
        <p className="mt-1 text-sm font-medium text-mint-600 dark:text-mint-400">
          {t('upload.browse')}
        </p>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          {t('upload.maxSize', { size: maxSizeMB })}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="mt-3 space-y-2">
          {selectedFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-gray-100 px-4 py-2 dark:bg-gray-800"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {file.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatSize(file.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

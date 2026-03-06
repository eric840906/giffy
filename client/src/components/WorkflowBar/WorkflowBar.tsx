import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TOOLS, type ToolId } from '../../utils/constants';

interface WorkflowBarProps {
  /** Processed file to download or forward */
  file: Blob;
  /** Suggested download file name */
  fileName: string;
  /** Current tool ID (excluded from send-to list) */
  currentTool: ToolId | string;
  /** Optional callback for "Continue Editing" action */
  onContinueEdit?: () => void;
}

/**
 * Workflow bar with download, continue editing, and send-to-tool actions.
 * Appears after processing is complete.
 */
export function WorkflowBar({ file, fileName, currentTool, onContinueEdit }: WorkflowBarProps) {
  const { t } = useTranslation();
  const [showTools, setShowTools] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Close dropdown on click-outside or Escape key */
  useEffect(() => {
    if (!showTools) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTools(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTools(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showTools]);

  /** Download the processed file */
  const handleDownload = useCallback(() => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [file, fileName]);

  const otherTools = TOOLS.filter((tool) => tool.id !== currentTool);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={handleDownload}
        className="rounded-xl bg-mint-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-mint-700"
        aria-label={t('workflow.download')}
      >
        {t('workflow.download')}
      </button>

      {onContinueEdit && (
        <button
          onClick={onContinueEdit}
          className="rounded-xl border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label={t('workflow.continueEdit')}
        >
          {t('workflow.continueEdit')}
        </button>
      )}

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowTools((v) => !v)}
          className="rounded-xl border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label={t('workflow.sendToTool')}
        >
          {t('workflow.sendToTool')}
        </button>

        {showTools && (
          <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <p className="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500">
              {t('workflow.selectTool')}
            </p>
            {otherTools.map((tool) => (
              <Link
                key={tool.id}
                to={tool.path}
                state={{ file, fileName }}
                className="block px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-mint-50 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={() => setShowTools(false)}
              >
                <tool.icon size={16} weight="duotone" className="mr-2 inline-block align-text-bottom" />
                {t(`home.tools.${tool.id}.name`)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

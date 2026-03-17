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
  const [editName, setEditName] = useState(fileName);
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

  /** Download the processed file with user-editable name */
  const handleDownload = useCallback(() => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = editName || fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [file, editName, fileName]);

  const otherTools = TOOLS.filter((tool) => {
    if (tool.id === currentTool) return false;
    // Match file MIME type against the tool's accept patterns
    const mimeType = file.type;
    if (!mimeType) return true;
    return tool.accept.split(',').some((pattern) => {
      const p = pattern.trim();
      if (p === mimeType) return true;
      if (p.endsWith('/*') && mimeType.startsWith(p.replace('/*', '/'))) return true;
      return false;
    });
  });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Editable file name */}
      <div className="flex items-center gap-2">
        <label htmlFor="workflow-filename" className="shrink-0 text-sm font-medium text-gray-600 dark:text-gray-300">
          {t('workflow.fileName')}
        </label>
        <input
          id="workflow-filename"
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
          <div className="absolute left-0 bottom-full z-10 mb-2 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <p className="px-2 pb-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
              {t('workflow.selectTool')}
            </p>
            <div className="flex gap-1.5">
              {otherTools.map((tool) => (
                <Link
                  key={tool.id}
                  to={tool.path}
                  state={{ file, fileName }}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-mint-50 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={() => setShowTools(false)}
                >
                  <tool.icon size={16} weight="duotone" className="shrink-0" />
                  {t(`home.tools.${tool.id}.name`)}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

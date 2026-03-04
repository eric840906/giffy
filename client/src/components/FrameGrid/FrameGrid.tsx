import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Data for a single animation frame */
export interface FrameData {
  /** Unique ID for React keys and selection */
  id: string;
  /** PNG image data */
  blob: Blob;
  /** Delay in ms after this frame */
  delay: number;
  /** Original frame number (1-based) */
  originalIndex: number;
}

interface FrameGridProps {
  /** Ordered list of frame data */
  frames: FrameData[];
  /** Set of selected frame IDs */
  selectedIds: Set<string>;
  /** Called when selection changes */
  onSelectionChange: (ids: Set<string>) => void;
  /** Called with reordered frames array after drag-drop */
  onReorder: (frames: FrameData[]) => void;
  /** Called to delete a single frame by ID */
  onDelete?: (id: string) => void;
  /** Called to duplicate a single frame by ID */
  onDuplicate?: (id: string) => void;
  /** Whether interactions are disabled (e.g. during processing) */
  disabled?: boolean;
}

/**
 * Thumbnail grid for animated image frames with selection and drag-reorder.
 *
 * Supports click (single select), Shift+click (range select),
 * Ctrl/Cmd+click (toggle select), and HTML5 drag-and-drop reordering.
 * Object URLs are managed via useState + useEffect to avoid React 18 strict mode issues.
 */
export function FrameGrid({
  frames,
  selectedIds,
  onSelectionChange,
  onReorder,
  onDelete,
  onDuplicate,
  disabled = false,
}: FrameGridProps) {
  const { t } = useTranslation();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /** Last clicked index for Shift+click range selection */
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  /** Object URLs for frame thumbnails */
  const [objectUrls, setObjectUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = frames.map((frame) => URL.createObjectURL(frame.blob));
    setObjectUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [frames]);

  /**
   * Handle frame click with selection modifiers.
   * - Plain click: single select
   * - Shift+click: range select from last clicked
   * - Ctrl/Cmd+click: toggle selection
   */
  const handleClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      if (disabled) return;

      const frameId = frames[index].id;

      if (e.shiftKey && lastClickedIndex !== null) {
        // Range select
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        const newIds = new Set(selectedIds);
        for (let i = start; i <= end; i++) {
          newIds.add(frames[i].id);
        }
        onSelectionChange(newIds);
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle select
        const newIds = new Set(selectedIds);
        if (newIds.has(frameId)) {
          newIds.delete(frameId);
        } else {
          newIds.add(frameId);
        }
        onSelectionChange(newIds);
      } else {
        // Single select
        onSelectionChange(new Set([frameId]));
      }

      setLastClickedIndex(index);
    },
    [disabled, frames, lastClickedIndex, selectedIds, onSelectionChange],
  );

  /** Initiates a drag operation, storing the source index */
  const handleDragStart = useCallback(
    (index: number) => {
      if (disabled) return;
      setDragIndex(index);
    },
    [disabled],
  );

  /** Tracks which item is being dragged over for visual feedback */
  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [dragIndex],
  );

  /** Completes the drag-drop reorder operation */
  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === dropIndex) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }

      const reordered = [...frames];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      onReorder(reordered);

      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, frames, onReorder],
  );

  /** Resets drag state when drag operation ends */
  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('frameEditor.dragToReorder')}
        </p>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {t('frameEditor.frameCount', { count: frames.length })}
        </p>
      </div>

      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label={t('frameEditor.frameCount', { count: frames.length })}
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
      >
        {frames.map((frame, index) => {
          const isSelected = selectedIds.has(frame.id);

          return (
            <div
              key={frame.id}
              draggable={!disabled}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={(e) => handleClick(index, e)}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              className={`group relative cursor-pointer select-none rounded-xl border-2 transition-all ${
                dragIndex === index
                  ? 'border-purple-500 opacity-50'
                  : dragOverIndex === index
                    ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/20'
                    : isSelected
                      ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-300 dark:bg-purple-950/20 dark:ring-purple-700'
                      : 'border-gray-200 hover:border-purple-300 dark:border-gray-700 dark:hover:border-purple-600'
              } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
            >
              {/* Frame number badge */}
              <div className="absolute left-1 top-1 z-10 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {frame.originalIndex}
              </div>

              {/* Per-frame action buttons (top-right, visible on hover) */}
              {!disabled && (
                <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {onDuplicate && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDuplicate(frame.id); }}
                      aria-label={t('frameEditor.copySelected')}
                      className="flex h-5 w-5 items-center justify-center rounded bg-blue-500 text-[10px] text-white shadow-sm hover:bg-blue-600"
                    >
                      +
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(frame.id); }}
                      aria-label={t('frameEditor.deleteSelected')}
                      className="flex h-5 w-5 items-center justify-center rounded bg-red-500 text-[10px] text-white shadow-sm hover:bg-red-600"
                    >
                      x
                    </button>
                  )}
                </div>
              )}

              {/* Thumbnail */}
              <div className="aspect-square overflow-hidden rounded-t-lg">
                <img
                  src={objectUrls[index] || ''}
                  alt={t('frameEditor.frameNumber', { num: frame.originalIndex })}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </div>

              {/* Delay label */}
              <div className="px-1.5 py-1 text-center text-[10px] text-gray-500 dark:text-gray-400">
                {t('frameEditor.delayMs', { delay: frame.delay })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

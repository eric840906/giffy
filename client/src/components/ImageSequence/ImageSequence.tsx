import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ImageSequenceProps {
  /** Ordered list of image files */
  images: File[];
  /** Called with reordered images array after drag-drop */
  onReorder: (images: File[]) => void;
  /** Called with index of image to remove */
  onRemove: (index: number) => void;
}

/**
 * Drag-to-reorder image thumbnail grid for composing image sequences.
 * Uses HTML5 native drag-and-drop for reordering and creates/revokes
 * object URLs via useMemo to prevent memory leaks.
 *
 * @example
 * ```tsx
 * <ImageSequence
 *   images={files}
 *   onReorder={setFiles}
 *   onRemove={(i) => setFiles(files.filter((_, idx) => idx !== i))}
 * />
 * ```
 */
export function ImageSequence({ images, onReorder, onRemove }: ImageSequenceProps) {
  const { t } = useTranslation();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /**
   * Creates object URLs for each image file. The URLs are memoized based on
   * the images array identity so they are only recreated when images change.
   */
  const objectUrls = useMemo(
    () => images.map((file) => URL.createObjectURL(file)),
    [images],
  );

  /** Revokes all object URLs when they change or component unmounts */
  useEffect(() => {
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [objectUrls]);

  /** Initiates a drag operation, storing the source index */
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

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

      const reordered = [...images];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      onReorder(reordered);

      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, images, onReorder],
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
          {t('imagesToGif.dragToReorder')}
        </p>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {t('imagesToGif.imageCount', { count: images.length })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {images.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`group relative cursor-grab rounded-2xl border-2 transition-all ${
              dragIndex === index
                ? 'border-purple-500 opacity-50'
                : dragOverIndex === index
                  ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/20'
                  : 'border-gray-200 hover:border-purple-300 dark:border-gray-700 dark:hover:border-purple-600'
            }`}
          >
            <div className="aspect-square overflow-hidden rounded-t-xl">
              <img
                src={objectUrls[index]}
                alt={file.name}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="truncate px-2 py-1.5 text-center text-xs text-gray-600 dark:text-gray-300">
              {file.name}
            </div>

            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`${t('imagesToGif.removeImage')}: ${file.name}`}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:bg-red-600"
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

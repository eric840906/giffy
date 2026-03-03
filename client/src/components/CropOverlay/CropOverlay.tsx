import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface CropRect {
  /** Left offset in pixels (relative to image natural size) */
  x: number;
  /** Top offset in pixels (relative to image natural size) */
  y: number;
  /** Crop width in pixels (in image coordinates) */
  width: number;
  /** Crop height in pixels (in image coordinates) */
  height: number;
}

interface CropOverlayProps {
  /** Source URL of the image to display */
  src: string;
  /** Natural width of the image */
  imageWidth: number;
  /** Natural height of the image */
  imageHeight: number;
  /** Current crop rectangle (in image coordinates) */
  crop: CropRect;
  /** Called when crop changes */
  onChange: (crop: CropRect) => void;
}

/** Minimum crop dimension in image pixels */
const MIN_CROP_SIZE = 10;

/**
 * All possible drag interaction modes for the crop overlay.
 * - 'none': idle state
 * - 'create': user is drawing a new crop rectangle
 * - 'move': user is dragging the crop area to reposition it
 * - 'nw'|'ne'|'sw'|'se': corner resize handles
 * - 'n'|'s'|'e'|'w': edge resize handles
 */
type DragMode =
  | 'none'
  | 'create'
  | 'move'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'e'
  | 'w';

/** Drag state stored in a ref to avoid stale closures in mouse handlers */
interface DragState {
  mode: DragMode;
  /** Starting mouse position in image coordinates */
  startX: number;
  startY: number;
  /** Original crop rect at drag start */
  originalCrop: CropRect;
}

/**
 * Clamps a crop rectangle to remain within image bounds and enforces a minimum size.
 *
 * @param rect - The crop rectangle to constrain
 * @param imgW - The natural image width
 * @param imgH - The natural image height
 * @returns A new CropRect that is valid within the image bounds
 */
function clampCrop(rect: CropRect, imgW: number, imgH: number): CropRect {
  let { x, y, width, height } = rect;

  // Enforce minimum dimensions
  width = Math.max(width, MIN_CROP_SIZE);
  height = Math.max(height, MIN_CROP_SIZE);

  // Clamp dimensions to image bounds
  width = Math.min(width, imgW);
  height = Math.min(height, imgH);

  // Clamp position so the crop stays inside the image
  x = Math.max(0, Math.min(x, imgW - width));
  y = Math.max(0, Math.min(y, imgH - height));

  return { x, y, width, height };
}

/**
 * Returns the cursor CSS class for a given drag mode.
 */
function cursorForMode(mode: DragMode): string {
  switch (mode) {
    case 'move':
      return 'cursor-move';
    case 'nw':
    case 'se':
      return 'cursor-nwse-resize';
    case 'ne':
    case 'sw':
      return 'cursor-nesw-resize';
    case 'n':
    case 's':
      return 'cursor-ns-resize';
    case 'e':
    case 'w':
      return 'cursor-ew-resize';
    default:
      return 'cursor-crosshair';
  }
}

/**
 * CropOverlay renders an image with a draggable/resizable crop selection rectangle.
 *
 * The user can:
 * - Click and drag on the image to create a new crop area
 * - Drag the crop area to move it
 * - Drag corner or edge handles to resize it
 *
 * The crop rectangle is specified in image-space coordinates (relative to
 * the image's natural width/height). All coordinate conversions between
 * screen pixels and image pixels are handled internally.
 *
 * @example
 * ```tsx
 * const [crop, setCrop] = useState({ x: 0, y: 0, width: 200, height: 150 });
 * <CropOverlay
 *   src={imageUrl}
 *   imageWidth={800}
 *   imageHeight={600}
 *   crop={crop}
 *   onChange={setCrop}
 * />
 * ```
 */
export function CropOverlay({
  src,
  imageWidth,
  imageHeight,
  crop,
  onChange,
}: CropOverlayProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({
    mode: 'none',
    startX: 0,
    startY: 0,
    originalCrop: { x: 0, y: 0, width: 0, height: 0 },
  });

  /**
   * Converts client (screen) coordinates to image-space coordinates
   * using the ratio between the displayed container size and the
   * image's natural dimensions.
   */
  const toImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const scaleX = imageWidth / rect.width;
      const scaleY = imageHeight / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    [imageWidth, imageHeight]
  );

  /**
   * Handler for mouse movement during a drag operation.
   * Computes the new crop rectangle based on the drag mode and mouse delta.
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const state = dragRef.current;
      if (state.mode === 'none') return;

      const { x: imgX, y: imgY } = toImageCoords(e.clientX, e.clientY);
      const dx = imgX - state.startX;
      const dy = imgY - state.startY;
      const orig = state.originalCrop;
      let newCrop: CropRect;

      switch (state.mode) {
        case 'create': {
          // Drawing a new rectangle from the start point to the current mouse position
          const x1 = Math.min(state.startX, imgX);
          const y1 = Math.min(state.startY, imgY);
          const x2 = Math.max(state.startX, imgX);
          const y2 = Math.max(state.startY, imgY);
          newCrop = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
          break;
        }
        case 'move': {
          newCrop = {
            x: orig.x + dx,
            y: orig.y + dy,
            width: orig.width,
            height: orig.height,
          };
          break;
        }
        case 'nw': {
          newCrop = {
            x: orig.x + dx,
            y: orig.y + dy,
            width: orig.width - dx,
            height: orig.height - dy,
          };
          break;
        }
        case 'ne': {
          newCrop = {
            x: orig.x,
            y: orig.y + dy,
            width: orig.width + dx,
            height: orig.height - dy,
          };
          break;
        }
        case 'sw': {
          newCrop = {
            x: orig.x + dx,
            y: orig.y,
            width: orig.width - dx,
            height: orig.height + dy,
          };
          break;
        }
        case 'se': {
          newCrop = {
            x: orig.x,
            y: orig.y,
            width: orig.width + dx,
            height: orig.height + dy,
          };
          break;
        }
        case 'n': {
          newCrop = {
            x: orig.x,
            y: orig.y + dy,
            width: orig.width,
            height: orig.height - dy,
          };
          break;
        }
        case 's': {
          newCrop = {
            x: orig.x,
            y: orig.y,
            width: orig.width,
            height: orig.height + dy,
          };
          break;
        }
        case 'w': {
          newCrop = {
            x: orig.x + dx,
            y: orig.y,
            width: orig.width - dx,
            height: orig.height,
          };
          break;
        }
        case 'e': {
          newCrop = {
            x: orig.x,
            y: orig.y,
            width: orig.width + dx,
            height: orig.height,
          };
          break;
        }
        default:
          return;
      }

      onChange(clampCrop(newCrop, imageWidth, imageHeight));
    },
    [toImageCoords, onChange, imageWidth, imageHeight]
  );

  /**
   * Handler for mouse up: ends the current drag operation and
   * removes window-level mouse event listeners.
   */
  const handleMouseUp = useCallback(() => {
    dragRef.current.mode = 'none';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  /**
   * Initiates a drag operation of the given mode at the specified
   * screen coordinates. Registers window-level listeners for
   * mousemove and mouseup.
   */
  const startDrag = useCallback(
    (mode: DragMode, clientX: number, clientY: number) => {
      const { x, y } = toImageCoords(clientX, clientY);
      dragRef.current = {
        mode,
        startX: x,
        startY: y,
        originalCrop: { ...crop },
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [toImageCoords, crop, handleMouseMove, handleMouseUp]
  );

  /**
   * Mouse down on the container background starts a new crop creation.
   */
  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start a new crop if clicking outside the crop area (on the overlay itself)
      if ((e.target as HTMLElement).closest('[data-testid="crop-rect"]')) return;
      e.preventDefault();
      startDrag('create', e.clientX, e.clientY);
    },
    [startDrag]
  );

  /**
   * Mouse down on the crop rectangle starts a move operation.
   */
  const handleCropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startDrag('move', e.clientX, e.clientY);
    },
    [startDrag]
  );

  /**
   * Creates a mousedown handler for a specific resize handle.
   */
  const handleHandleMouseDown = useCallback(
    (mode: DragMode) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startDrag(mode, e.clientX, e.clientY);
    },
    [startDrag]
  );

  // Clean up window listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Convert crop from image coordinates to display percentages for positioning
  const cropLeft = (crop.x / imageWidth) * 100;
  const cropTop = (crop.y / imageHeight) * 100;
  const cropWidth = (crop.width / imageWidth) * 100;
  const cropHeight = (crop.height / imageHeight) * 100;

  /** Handle definitions: position (CSS percentage), cursor mode, and position offsets */
  const handles: Array<{
    mode: DragMode;
    style: React.CSSProperties;
    cursor: string;
  }> = [
    // Corners
    {
      mode: 'nw',
      style: { left: `${cropLeft}%`, top: `${cropTop}%`, transform: 'translate(-50%, -50%)' },
      cursor: cursorForMode('nw'),
    },
    {
      mode: 'ne',
      style: {
        left: `${cropLeft + cropWidth}%`,
        top: `${cropTop}%`,
        transform: 'translate(-50%, -50%)',
      },
      cursor: cursorForMode('ne'),
    },
    {
      mode: 'sw',
      style: {
        left: `${cropLeft}%`,
        top: `${cropTop + cropHeight}%`,
        transform: 'translate(-50%, -50%)',
      },
      cursor: cursorForMode('sw'),
    },
    {
      mode: 'se',
      style: {
        left: `${cropLeft + cropWidth}%`,
        top: `${cropTop + cropHeight}%`,
        transform: 'translate(-50%, -50%)',
      },
      cursor: cursorForMode('se'),
    },
    // Edges
    {
      mode: 'n',
      style: {
        left: `${cropLeft + cropWidth / 2}%`,
        top: `${cropTop}%`,
        transform: 'translate(-50%, -50%)',
      },
      cursor: cursorForMode('n'),
    },
    {
      mode: 's',
      style: {
        left: `${cropLeft + cropWidth / 2}%`,
        top: `${cropTop + cropHeight}%`,
        transform: 'translate(-50%, -50%)',
      },
      cursor: cursorForMode('s'),
    },
    {
      mode: 'w',
      style: {
        left: `${cropLeft}%`,
        top: `${cropTop + cropHeight / 2}%`,
        transform: 'translate(-50%, -50%)',
      },
      cursor: cursorForMode('w'),
    },
    {
      mode: 'e',
      style: {
        left: `${cropLeft + cropWidth}%`,
        top: `${cropTop + cropHeight / 2}%`,
        transform: 'translate(-50%, -50%)',
      },
      cursor: cursorForMode('e'),
    },
  ];

  return (
    <div
      ref={containerRef}
      data-testid="crop-overlay"
      className="relative overflow-hidden rounded-xl border border-gray-200 cursor-crosshair select-none dark:border-gray-700"
      onMouseDown={handleContainerMouseDown}
      role="application"
      aria-label={t('gifCropResize.cropHint')}
    >
      {/* Source image */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="block w-full h-auto"
      />

      {/* Dark overlay: four rectangles around the crop area */}
      {/* Top overlay */}
      <div
        data-testid="crop-overlay-top"
        className="absolute left-0 top-0 bg-black/50 pointer-events-none"
        style={{
          width: '100%',
          height: `${cropTop}%`,
        }}
      />
      {/* Bottom overlay */}
      <div
        data-testid="crop-overlay-bottom"
        className="absolute left-0 bottom-0 bg-black/50 pointer-events-none"
        style={{
          width: '100%',
          height: `${100 - cropTop - cropHeight}%`,
        }}
      />
      {/* Left overlay */}
      <div
        data-testid="crop-overlay-left"
        className="absolute left-0 bg-black/50 pointer-events-none"
        style={{
          top: `${cropTop}%`,
          width: `${cropLeft}%`,
          height: `${cropHeight}%`,
        }}
      />
      {/* Right overlay */}
      <div
        data-testid="crop-overlay-right"
        className="absolute bg-black/50 pointer-events-none"
        style={{
          top: `${cropTop}%`,
          left: `${cropLeft + cropWidth}%`,
          width: `${100 - cropLeft - cropWidth}%`,
          height: `${cropHeight}%`,
        }}
      />

      {/* Crop rectangle border */}
      <div
        data-testid="crop-rect"
        className={`absolute border-2 border-dashed border-white ${cursorForMode('move')}`}
        style={{
          left: `${cropLeft}%`,
          top: `${cropTop}%`,
          width: `${cropWidth}%`,
          height: `${cropHeight}%`,
        }}
        onMouseDown={handleCropMouseDown}
      />

      {/* Resize handles */}
      {handles.map((handle) => (
        <div
          key={handle.mode}
          data-testid="crop-handle"
          className={`absolute h-2.5 w-2.5 rounded-sm border border-gray-400 bg-white ${handle.cursor}`}
          style={handle.style}
          onMouseDown={handleHandleMouseDown(handle.mode)}
        />
      ))}
    </div>
  );
}

import type { Icon } from '@phosphor-icons/react';
import {
  FilmReel,
  Images,
  Crop,
  Scissors,
  Selection,
  Timer,
  Package,
  ArrowsClockwise,
  Camera,
  ArrowsOut,
  Swap,
  FilmStrip,
  GridNine,
  TextT,
  Palette,
  FileArrowDown,
} from '@phosphor-icons/react';

/** Maximum file size in bytes (50MB) */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum file size in MB for display */
export const MAX_FILE_SIZE_MB = 50;

/** All tool IDs */
export type ToolId =
  | 'videoToGif'
  | 'imagesToGif'
  | 'gifCropResize'
  | 'videoTrim'
  | 'videoCrop'
  | 'gifSpeed'
  | 'gifCompress'
  | 'videoConvert'
  | 'videoScreenshot'
  | 'videoResize'
  | 'imageConvert'
  | 'animatedConvert'
  | 'frameEditor'
  | 'gifTextOverlay'
  | 'videoFilter'
  | 'imageCompress';

/** Tool category */
export type ToolCategory = 'gif' | 'video' | 'image';

/** Tool definition */
interface ToolDefinition {
  id: ToolId;
  path: string;
  icon: Icon;
  category: ToolCategory;
  accept: string;
  multiple?: boolean;
}

/** Tool definitions used for Home page cards and WorkflowBar */
export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'videoToGif',
    path: '/gif/video-to-gif',
    icon: FilmReel,
    category: 'gif',
    accept: 'video/*',
  },
  {
    id: 'imagesToGif',
    path: '/gif/images-to-gif',
    icon: Images,
    category: 'gif',
    accept: 'image/*',
    multiple: true,
  },
  {
    id: 'gifCropResize',
    path: '/gif/crop-resize',
    icon: Crop,
    category: 'gif',
    accept: 'image/gif',
  },
  {
    id: 'videoTrim',
    path: '/video/trim',
    icon: Scissors,
    category: 'video',
    accept: 'video/*',
  },
  {
    id: 'videoCrop',
    path: '/video/crop',
    icon: Selection,
    category: 'video',
    accept: 'video/*',
  },
  {
    id: 'gifSpeed',
    path: '/gif/speed',
    icon: Timer,
    category: 'gif',
    accept: 'image/gif',
  },
  {
    id: 'gifCompress',
    path: '/gif/compress',
    icon: Package,
    category: 'gif',
    accept: 'image/gif',
  },
  {
    id: 'videoConvert',
    path: '/video/convert',
    icon: ArrowsClockwise,
    category: 'video',
    accept: 'video/*',
  },
  {
    id: 'videoScreenshot',
    path: '/video/screenshot',
    icon: Camera,
    category: 'video',
    accept: 'video/*',
  },
  {
    id: 'videoResize',
    path: '/video/resize',
    icon: ArrowsOut,
    category: 'video',
    accept: 'video/*',
  },
  {
    id: 'imageConvert',
    path: '/image/convert',
    icon: Swap,
    category: 'image',
    accept: 'image/*',
    multiple: true,
  },
  {
    id: 'animatedConvert',
    path: '/image/animated-convert',
    icon: FilmStrip,
    category: 'image',
    accept: 'image/gif,image/apng,image/png,image/webp',
    multiple: true,
  },
  {
    id: 'frameEditor',
    path: '/gif/frame-editor',
    icon: GridNine,
    category: 'gif',
    accept: 'image/gif,image/apng,image/png,image/webp',
  },
  {
    id: 'gifTextOverlay',
    path: '/gif/text-overlay',
    icon: TextT,
    category: 'gif',
    accept: 'image/gif',
  },
  {
    id: 'videoFilter',
    path: '/video/filter',
    icon: Palette,
    category: 'video',
    accept: 'video/*',
  },
  {
    id: 'imageCompress',
    path: '/image/compress',
    icon: FileArrowDown,
    category: 'image',
    accept: 'image/png,image/jpeg,image/webp',
    multiple: true,
  },
];

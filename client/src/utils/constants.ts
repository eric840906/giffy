/** Maximum file size in bytes (50MB) */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum file size in MB for display */
export const MAX_FILE_SIZE_MB = 50;

/** Tool definitions used for Home page cards and WorkflowBar */
export const TOOLS = [
  {
    id: 'videoToGif',
    path: '/gif/video-to-gif',
    icon: '🎬',
    category: 'gif' as const,
    accept: 'video/*',
  },
  {
    id: 'imagesToGif',
    path: '/gif/images-to-gif',
    icon: '🖼️',
    category: 'gif' as const,
    accept: 'image/*',
    multiple: true,
  },
  {
    id: 'gifCropResize',
    path: '/gif/crop-resize',
    icon: '✂️',
    category: 'gif' as const,
    accept: 'image/gif',
  },
  {
    id: 'videoTrim',
    path: '/video/trim',
    icon: '⏱️',
    category: 'video' as const,
    accept: 'video/*',
  },
  {
    id: 'videoCrop',
    path: '/video/crop',
    icon: '📐',
    category: 'video' as const,
    accept: 'video/*',
  },
  {
    id: 'gifSpeed',
    path: '/gif/speed',
    icon: '⚡',
    category: 'gif' as const,
    accept: 'image/gif',
  },
  {
    id: 'imageConvert',
    path: '/image/convert',
    icon: '🔄',
    category: 'image' as const,
    accept: 'image/*',
    multiple: true,
  },
] as const;

export type ToolId = (typeof TOOLS)[number]['id'];
export type ToolCategory = (typeof TOOLS)[number]['category'];

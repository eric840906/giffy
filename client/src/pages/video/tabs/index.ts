import type { FFmpeg } from '@ffmpeg/ffmpeg';

/** Props shared by all Video Editor tabs */
export interface VideoTabProps {
  videoFile: File;
  videoUrl: string;
  videoWidth: number;
  videoHeight: number;
  videoDuration: number;
  ffmpeg: FFmpeg;
  ffmpegLoaded: boolean;
  isProcessing: boolean;
  onProcessStart: () => void;
  onProcessProgress: (progress: number) => void;
  onProcessComplete: (blob: Blob) => void;
  onProcessError: (message: string) => void;
}

export { TrimTab } from './TrimTab';
export { CropTab } from './CropTab';
export { ResizeTab } from './ResizeTab';
export { FilterTab } from './FilterTab';

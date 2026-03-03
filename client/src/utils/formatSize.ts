/**
 * Formats bytes to a human-readable size string.
 *
 * @param bytes - File size in bytes
 * @returns Formatted string like "1.5 MB", "320 KB", or "128 B"
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

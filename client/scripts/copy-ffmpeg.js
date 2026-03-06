/**
 * Copies ffmpeg-core.js and ffmpeg-core.wasm from @ffmpeg/core-mt
 * into public/ffmpeg/ so they can be served as static assets.
 *
 * These files are .gitignored (~32MB wasm + ~132KB js) to keep the
 * repository lightweight. This script runs automatically via the
 * "postinstall" npm hook after `npm install`.
 */
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '..', 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'esm');
const dest = join(__dirname, '..', 'public', 'ffmpeg');

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'];

if (!existsSync(src)) {
  console.warn('[copy-ffmpeg] @ffmpeg/core-mt not found in node_modules — skipping.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });

for (const file of files) {
  const from = join(src, file);
  const to = join(dest, file);
  if (existsSync(from)) {
    copyFileSync(from, to);
    console.log(`[copy-ffmpeg] ${file} -> public/ffmpeg/`);
  } else {
    console.warn(`[copy-ffmpeg] ${file} not found in @ffmpeg/core-mt — skipping.`);
  }
}

console.log('[copy-ffmpeg] Done.');

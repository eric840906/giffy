import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

/**
 * Required headers for SharedArrayBuffer (ffmpeg.wasm).
 * Without these headers, SharedArrayBuffer is unavailable in the browser,
 * which prevents ffmpeg.wasm from functioning.
 */
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

/** Serve static client build in production */
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

/**
 * SPA fallback: serve index.html for all unmatched routes
 * so client-side routing (React Router) works correctly.
 * Express 5 requires named wildcard parameters.
 */
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Giffy server running on http://localhost:${PORT}`);
});

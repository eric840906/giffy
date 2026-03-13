/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const base = process.env.GITHUB_ACTIONS ? '/giffy/' : '/'

/**
 * Vite plugin to rewrite asset paths in index.html that Vite doesn't handle:
 * - Non-module <script> src (coi-serviceworker)
 * - <link> favicon href
 * - <meta> og:image content
 */
function htmlBaseRewrite(): Plugin {
  return {
    name: 'html-base-rewrite',
    transformIndexHtml(html) {
      return html
        .replace('src="coi-serviceworker.min.js"', `src="${base}coi-serviceworker.min.js"`)
        .replace('href="/favicon.png"', `href="${base}favicon.png"`)
        .replace('content="/logo.png"', `content="${base}logo.png"`)
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), htmlBaseRewrite()],
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})

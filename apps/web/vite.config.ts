import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes a `.br` and a `.gz` twin of every compressible file of the build, at the slowest and
 * smallest settings, so the API server sends them as they are (apps/api/src/lib/http.ts)
 * instead of compressing on every request.
 */
function precompress(): Plugin {
  const compressible = /\.(?:js|mjs|css|html|svg|json|webmanifest|txt|xml|map|wasm)$/;
  let outDir = 'dist';
  const filesIn = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? filesIn(path) : [path];
    });
  return {
    name: 'tatagereja-precompress',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const file of filesIn(outDir)) {
        if (!compressible.test(file)) continue;
        const content = readFileSync(file);
        if (content.byteLength < 1024) continue;
        writeFileSync(
          `${file}.br`,
          brotliCompressSync(content, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
              [constants.BROTLI_PARAM_SIZE_HINT]: content.byteLength,
            },
          }),
        );
        writeFileSync(`${file}.gz`, gzipSync(content, { level: 9 }));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precompress()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
  },
});

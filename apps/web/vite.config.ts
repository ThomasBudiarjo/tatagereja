import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, runnerImport, type Plugin } from 'vite';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

/**
 * `virtual:locale-messages/<locale>`: the messages of every feature dictionary in one
 * language, as `{ '<namespace>.<key>': message }`. The app downloads only the language it
 * shows, half the bytes of `features/dictionaries.ts` (which holds both). A build evaluates
 * the dictionaries once with Vite's module runner; the dev server reads them live instead,
 * so edits still hot-reload.
 */
function localeMessages(): Plugin {
  const prefix = 'virtual:locale-messages/';
  const dictionaries = '/src/features/dictionaries.ts';
  let command: 'build' | 'serve' = 'build';
  type Dictionary = { namespace: string; messages: Record<string, Record<string, unknown>> };
  let loaded: Promise<Dictionary[]> | null = null;
  return {
    name: 'tatagereja-locale-messages',
    configResolved(config) {
      command = config.command;
    },
    resolveId(id) {
      return id.startsWith(prefix) ? `\0${id}` : undefined;
    },
    async load(id) {
      if (!id.startsWith(`\0${prefix}`)) return undefined;
      const locale = JSON.stringify(id.slice(prefix.length + 1));
      if (command === 'serve') {
        return [
          `import { DICTIONARIES } from '${dictionaries}';`,
          `export default Object.fromEntries(DICTIONARIES.flatMap((d) =>`,
          `  Object.entries(d.messages[${locale}]).map(([key, m]) => [d.namespace + '.' + key, m])));`,
        ].join('\n');
      }
      loaded ??= runnerImport<{ DICTIONARIES: Dictionary[] }>(
        join(srcDir, 'features/dictionaries.ts'),
        {
          configFile: false,
          logLevel: 'error',
          resolve: { alias: { '@': srcDir } },
        },
      ).then(({ module }) => module.DICTIONARIES);
      const messages: Record<string, unknown> = {};
      for (const dictionary of await loaded) {
        for (const [key, message] of Object.entries(
          dictionary.messages[JSON.parse(locale)] ?? {},
        )) {
          messages[`${dictionary.namespace}.${key}`] = message;
        }
      }
      return `export default ${JSON.stringify(messages)};`;
    },
  };
}

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

/**
 * Builds `dist/sw.js` from `service-worker.js`: the version (a hash of the build) and the
 * files to precache, which are the app shell: `index.html`, the entry with every chunk and
 * stylesheet it imports, the church shell (`church-routes.tsx`), the home screen and the
 * messages of both languages. Every other chunk is cached the first time it loads.
 */
function serviceWorker(): Plugin {
  const SHELL_ENTRIES = [
    /[\\/]src[\\/]church-routes\.tsx$/,
    /[\\/]src[\\/]features[\\/]dashboard[\\/]home-page\.tsx$/,
    /^\0virtual:locale-messages\//,
  ];
  return {
    name: 'tatagereja-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = new Map(
        Object.values(bundle).flatMap((item) =>
          item.type === 'chunk' ? [[item.fileName, item]] : [],
        ),
      );
      const files = new Set<string>(['index.html']);
      const visit = (fileName: string) => {
        const chunk = chunks.get(fileName);
        if (!chunk || files.has(fileName)) return;
        files.add(fileName);
        for (const css of chunk.viteMetadata?.importedCss ?? []) files.add(css);
        for (const imported of chunk.imports) visit(imported);
      };
      for (const chunk of chunks.values()) {
        const id = chunk.facadeModuleId ?? '';
        if (chunk.isEntry || SHELL_ENTRIES.some((pattern) => pattern.test(id)))
          visit(chunk.fileName);
      }
      for (const name of ['favicon.svg', 'csp-setup.js', 'manifest.webmanifest']) files.add(name);
      const precache = [...files].sort().map((file) => `/${file}`);
      const template = readFileSync(
        fileURLToPath(new URL('./service-worker.js', import.meta.url)),
        'utf8',
      );
      // Any changed file of the build (their names carry content hashes) or of the worker
      // itself is a new version.
      const version = createHash('sha256')
        .update(Object.keys(bundle).sort().join('\n'))
        .update(template)
        .digest('hex')
        .slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace("'__TG_VERSION__'", JSON.stringify(version))
          .replace('__TG_PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

/**
 * With `BUNDLE_REPORT=<file>`, writes every chunk of the build with its imports and the size
 * of each module in it, for `scripts/bundle-report.ts`.
 */
function bundleReport(): Plugin {
  return {
    name: 'tatagereja-bundle-report',
    apply: 'build',
    generateBundle(_options, bundle) {
      const file = process.env.BUNDLE_REPORT;
      if (!file) return;
      const chunks = Object.values(bundle).flatMap((chunk) =>
        chunk.type === 'chunk'
          ? [
              {
                file: chunk.fileName,
                isEntry: chunk.isEntry,
                imports: chunk.imports,
                dynamicImports: chunk.dynamicImports,
                modules: Object.entries(chunk.modules)
                  .map(([id, module]) => ({ id, size: module.renderedLength }))
                  .sort((a, b) => b.size - a.size),
              },
            ]
          : [],
      );
      writeFileSync(file, JSON.stringify({ chunks }));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localeMessages(),
    serviceWorker(),
    precompress(),
    bundleReport(),
  ],
  resolve: {
    alias: {
      '@': srcDir,
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
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // What the first screen needs from dependencies, in two long-cached chunks
            // (React, everything else) that an app release does not change.
            {
              name: 'react',
              test: /node_modules[\\/](?:react|react-dom|scheduler|react-router)[\\/]/,
              tags: ['$initial'],
              priority: 40,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              tags: ['$initial'],
              priority: 30,
            },
            // The UI primitives behind dialogs, menus, sheets and pickers: one chunk with the
            // first signed-in screen instead of a dozen tiny ones (each a round trip on 3G).
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](?:@radix-ui|radix-ui|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|aria-hidden|get-nonce|detect-node-es|tslib)[\\/]/,
              priority: 20,
            },
            // Icons used by later screens, together (each is a few hundred bytes).
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});

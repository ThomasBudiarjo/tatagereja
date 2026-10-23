/**
 * What the web build ships: the chunks of the first download and the biggest chunks overall,
 * with their compressed sizes and the packages or files that fill them.
 *
 *   BUNDLE_REPORT=/tmp/bundle.json bun run --cwd apps/web build
 *   bun scripts/bundle-report.ts /tmp/bundle.json [--dist apps/web/dist] [--top 25] [--chunk <name>]
 *
 * "Initial" is the entry chunk with every chunk it imports statically: what the browser
 * downloads before the first screen can render. Sizes are minified bytes and gzip level 9
 * (the `.gz` twins the server sends; brotli is about 15% smaller).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

type Chunk = {
  file: string;
  isEntry: boolean;
  imports: string[];
  dynamicImports: string[];
  modules: { id: string; size: number }[];
};

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const reportFile = args.find(
  (arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'),
);
if (!reportFile) throw new Error('Usage: bun scripts/bundle-report.ts <report.json>');
const dist = option('dist', 'apps/web/dist');
const top = Number(option('top', '25'));
const focus = option('chunk', '');

const { chunks } = JSON.parse(readFileSync(reportFile, 'utf8')) as { chunks: Chunk[] };
const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]));
const sizes = new Map<string, { raw: number; gzip: number }>();
const sizeOf = (file: string) => {
  let size = sizes.get(file);
  if (!size) {
    const content = readFileSync(join(dist, file));
    size = { raw: content.byteLength, gzip: gzipSync(content, { level: 9 }).byteLength };
    sizes.set(file, size);
  }
  return size;
};

/** Package name for dependencies, the path below `src/` for app and shared code. */
const owner = (id: string) => {
  const dependency = /.*node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id);
  if (dependency) return dependency[1]!;
  return id
    .replace(/.*\/apps\/web\/src\//, 'web/')
    .replace(/.*\/packages\/shared\/src\//, 'shared/')
    .replace(/\?.*$/, '');
};

const kb = (bytes: number) => (bytes / 1024).toFixed(1).padStart(7);

const initial = new Set<string>();
const visit = (file: string) => {
  if (initial.has(file)) return;
  initial.add(file);
  for (const imported of byFile.get(file)?.imports ?? []) visit(imported);
};
for (const chunk of chunks) if (chunk.isEntry) visit(chunk.file);

const total = (files: Iterable<string>) => {
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    raw += sizeOf(file).raw;
    gzip += sizeOf(file).gzip;
  }
  return { raw, gzip };
};

const initialTotal = total(initial);
console.info(
  `Initial JS: ${initial.size} chunks, ${kb(initialTotal.raw)} KB, ${kb(initialTotal.gzip)} KB gzip`,
);
for (const file of [...initial].sort((a, b) => sizeOf(b).gzip - sizeOf(a).gzip)) {
  console.info(`  ${kb(sizeOf(file).raw)} ${kb(sizeOf(file).gzip)}  ${file}`);
}
const all = total(chunks.map((chunk) => chunk.file));
console.info(`\nAll JS: ${chunks.length} chunks, ${kb(all.raw)} KB, ${kb(all.gzip)} KB gzip`);
console.info(`Biggest chunks (KB, KB gzip):`);
for (const chunk of [...chunks]
  .sort((a, b) => sizeOf(b.file).raw - sizeOf(a.file).raw)
  .slice(0, top)) {
  console.info(`  ${kb(sizeOf(chunk.file).raw)} ${kb(sizeOf(chunk.file).gzip)}  ${chunk.file}`);
}

const describe = (chunk: Chunk) => {
  const owners = new Map<string, number>();
  for (const module of chunk.modules) {
    owners.set(owner(module.id), (owners.get(owner(module.id)) ?? 0) + module.size);
  }
  console.info(`\n${chunk.file} (rendered sizes before minifying):`);
  for (const [name, size] of [...owners].sort((a, b) => b[1] - a[1]).slice(0, top)) {
    console.info(`  ${kb(size)}  ${name}`);
  }
};
for (const chunk of chunks) {
  if (
    focus ? chunk.file.includes(focus) : initial.has(chunk.file) && sizeOf(chunk.file).gzip > 20_000
  ) {
    describe(chunk);
  }
}

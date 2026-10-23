/**
 * Renders the app icons of the web app manifest from their SVG sources, with the preinstalled
 * Chromium (never run `playwright install`). Run after changing an icon:
 *
 *   bun scripts/generate-icons.ts
 *
 * `icons/icon.svg` is the regular icon (rounded, transparent corners); `icons/maskable.svg`
 * fills the whole square and keeps the cross inside the central safe zone, so launchers may
 * crop it to a circle or a squircle. The Apple touch icon is the maskable one: iOS rounds it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const dir = join(import.meta.dir, '../apps/web/public/icons');
const outputs = [
  { source: 'icon.svg', file: 'icon-192.png', size: 192 },
  { source: 'icon.svg', file: 'icon-512.png', size: 512 },
  { source: 'maskable.svg', file: 'maskable-192.png', size: 192 },
  { source: 'maskable.svg', file: 'maskable-512.png', size: 512 },
  { source: 'maskable.svg', file: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
for (const { source, file, size } of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(join(dir, source), 'utf8').replace(
    '<svg ',
    `<svg width="${size}" height="${size}" `,
  );
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
  );
  await page.screenshot({ path: join(dir, file), omitBackground: true });
  await page.close();
  console.info(`  ${file}`);
}
await browser.close();
